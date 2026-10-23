// Tests HTTP de bout en bout de l'US-03 — Traiter un incident (tâche 5.3).
// Couvre les exigences :
//   4.1 — tri de la file du technicien (priorité puis date de création).
//   4.2 — transition Ouvert → Résolu refusée (→ 400).
//   4.3 — passage à « Résolu » sans commentaire refusé (→ 400).
//   4.4 — modification par un technicien non assigné refusée (→ 403).
//
// La base est mockée en remplaçant le module ../src/db dans le cache de require
// AVANT de charger l'application (voir design.md « Testing Strategy », comme
// tests/us01-tickets.test.js et tests/technicienRoute.test.js). Le faux client
// transactionnel reprend le motif de tests/ticketService.test.js : il gère
// BEGIN/COMMIT/ROLLBACK, le SELECT ... FROM ticket WHERE id et l'UPDATE ...
// RETURNING, et journalise chaque requête exécutée.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

// Journal courant des requêtes (réinitialisé avant chaque test).
let dernierJournal = [];

// Registre de tickets simulés indexé par id, consommé par le SELECT/UPDATE du
// client transactionnel (changerStatut). Réinitialisé avant chaque test.
let ticketsSimules = {};

// Jeu de lignes représentatif renvoyé par la requête de file (GET), déjà trié
// par le SQL : Critique, puis Haute, Normale, Basse, puis cree_le croissant.
// On vérifie à la fois la clause ORDER BY imposée et le passage de ces lignes
// dans la réponse { tickets: [...] }.
const fileTriee = [
  { id: 10, numero: 'INC-2026-00010', statut: 'Ouvert', priorite: 'Critique', cree_le: '2026-01-01T08:00:00Z' },
  { id: 11, numero: 'INC-2026-00011', statut: 'En cours', priorite: 'Haute', cree_le: '2026-01-02T08:00:00Z' },
  { id: 12, numero: 'INC-2026-00012', statut: 'Ouvert', priorite: 'Normale', cree_le: '2026-01-03T08:00:00Z' },
  { id: 13, numero: 'INC-2026-00013', statut: 'Ouvert', priorite: 'Basse', cree_le: '2026-01-04T08:00:00Z' },
];

// Faux client transactionnel : gère BEGIN/COMMIT/ROLLBACK, le SELECT ticket par
// id et l'UPDATE ... RETURNING, à l'image de tests/ticketService.test.js.
function fabriquerClient(journal) {
  return {
    async query(text, params) {
      journal.push({ text, params });
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(text.trim())) {
        return { rows: [] };
      }
      if (/FROM ticket WHERE id/.test(text)) {
        const t = ticketsSimules[params[0]];
        return { rows: t ? [t] : [] };
      }
      if (/^UPDATE ticket/.test(text.trim())) {
        // Paramètres : [nouveauStatut, estResolu, ticketId]
        const [nouveauStatut, estResolu, id] = params;
        const t = ticketsSimules[id];
        const majLe = new Date();
        const resoluLe = estResolu ? new Date() : t ? t.resolu_le || null : null;
        if (t) {
          t.statut = nouveauStatut;
          t.maj_le = majLe;
          t.resolu_le = resoluLe;
        }
        return {
          rows: [
            {
              id,
              numero: t ? t.numero : 'INC-2026-00000',
              statut: nouveauStatut,
              maj_le: majLe,
              resolu_le: resoluLe,
            },
          ],
        };
      }
      return { rows: [] };
    },
    release() {},
  };
}

// db.query (hors transaction) : utilisé par la route de file. Renvoie la file
// déjà triée pour vérifier le passage des lignes dans la réponse.
function fakeQuery(text, params) {
  dernierJournal.push({ text, params });
  if (/FROM ticket/.test(text)) {
    return Promise.resolve({ rows: fileTriee });
  }
  return Promise.resolve({ rows: [] });
}

const fakePool = {
  connect: async () => fabriquerClient(dernierJournal),
  query: fakeQuery,
};

require.cache[cheminDb] = {
  id: cheminDb,
  filename: cheminDb,
  loaded: true,
  exports: { pool: fakePool, query: fakeQuery },
};

// Charger l'app APRÈS avoir injecté le mock.
const app = require('../src/app');

// Utilisateurs de référence.
const KARIM_ID = 2; // technicien assigné aux tickets de démo
const AUTRE_TECH_ID = 3; // technicien NON assigné

function jeton(role, id) {
  return jwt.sign({ id, nom: 'Test', role }, config.jwtSecret, { expiresIn: '1h' });
}

// Prépare un ticket simulé pour les PATCH et renvoie son id.
function poserTicket({ id = 500, statut = 'Ouvert', technicienId = KARIM_ID, auteurId = 1 } = {}) {
  ticketsSimules[id] = {
    id,
    numero: `INC-2026-${String(id).padStart(5, '0')}`,
    statut,
    auteur_id: auteurId,
    technicien_id: technicienId,
    maj_le: new Date('2026-01-01T00:00:00Z'),
    resolu_le: null,
  };
  return id;
}

test.beforeEach(() => {
  dernierJournal.length = 0;
  ticketsSimules = {};
});

// --- Exigence 4.1 : tri de la file -----------------------------------------
test('GET /api/technicien/tickets (technicien) applique le tri imposé et renvoie { tickets: [...] } (req 4.1)', async () => {
  const res = await request(app)
    .get('/api/technicien/tickets')
    .set('Authorization', `Bearer ${jeton('technicien', KARIM_ID)}`);

  assert.strictEqual(res.status, 200);

  // La réponse a bien la forme { tickets: [...] } et relaie les lignes triées.
  assert.ok(Array.isArray(res.body.tickets), 'la réponse expose un tableau tickets');
  assert.deepStrictEqual(
    res.body.tickets.map((t) => t.priorite),
    ['Critique', 'Haute', 'Normale', 'Basse'],
    'les tickets sont restitués dans l’ordre de priorité'
  );

  // Le SQL filtre sur le technicien courant et exclut les résolus.
  const requeteFile = dernierJournal.find((r) => /FROM ticket/.test(r.text));
  assert.ok(requeteFile, 'la route doit interroger la table ticket');
  assert.match(requeteFile.text, /t\.technicien_id = \$1/);
  assert.match(requeteFile.text, /t\.statut <> 'Résolu'/);
  assert.deepStrictEqual(requeteFile.params, [KARIM_ID]);

  // Le tri imposé par design.md est présent dans la clause ORDER BY.
  assert.match(
    requeteFile.text,
    /CASE t\.priorite\s+WHEN 'Critique' THEN 1\s+WHEN 'Haute' THEN 2\s+WHEN 'Normale' THEN 3\s+ELSE 4\s+END,\s+t\.cree_le ASC/
  );
});

// --- Exigence 4.3 : Résolu sans commentaire → 400 ---------------------------
test('PATCH /api/tickets/:id/statut vers Résolu sans commentaire renvoie 400 (req 4.3)', async () => {
  const id = poserTicket({ statut: 'En cours', technicienId: KARIM_ID });

  const res = await request(app)
    .patch(`/api/tickets/${id}/statut`)
    .set('Authorization', `Bearer ${jeton('technicien', KARIM_ID)}`)
    .send({ statut: 'Résolu' });

  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error, 'un message d’erreur doit être renvoyé');
  // La transaction est annulée et aucun UPDATE n'a été appliqué.
  const sqls = dernierJournal.map((q) => q.text);
  assert.ok(sqls.includes('ROLLBACK'), 'transaction annulée');
  assert.ok(!sqls.some((s) => /^UPDATE ticket/.test(s.trim())), 'aucun UPDATE ticket');
});

// --- Exigence 4.2 : transition Ouvert → Résolu refusée ----------------------
test('PATCH /api/tickets/:id/statut Ouvert → Résolu renvoie 400 même avec un commentaire (req 4.2)', async () => {
  const id = poserTicket({ statut: 'Ouvert', technicienId: KARIM_ID });

  const res = await request(app)
    .patch(`/api/tickets/${id}/statut`)
    .set('Authorization', `Bearer ${jeton('technicien', KARIM_ID)}`)
    .send({ statut: 'Résolu', commentaire: 'Intervention terminée.' });

  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error, 'un message d’erreur doit être renvoyé');
  const sqls = dernierJournal.map((q) => q.text);
  assert.ok(sqls.includes('ROLLBACK'), 'transaction annulée');
  assert.ok(!sqls.some((s) => /^UPDATE ticket/.test(s.trim())), 'aucun UPDATE ticket');
});

// --- Exigence 4.4 : autre technicien → 403 ----------------------------------
test('PATCH /api/tickets/:id/statut par un technicien non assigné renvoie 403 (req 4.4)', async () => {
  const id = poserTicket({ statut: 'Ouvert', technicienId: KARIM_ID });

  const res = await request(app)
    .patch(`/api/tickets/${id}/statut`)
    .set('Authorization', `Bearer ${jeton('technicien', AUTRE_TECH_ID)}`)
    .send({ statut: 'En cours' });

  assert.strictEqual(res.status, 403);
  assert.ok(res.body.error, 'un message d’erreur doit être renvoyé');
  const sqls = dernierJournal.map((q) => q.text);
  assert.ok(sqls.includes('ROLLBACK'), 'transaction annulée');
  assert.ok(!sqls.some((s) => /^UPDATE ticket/.test(s.trim())), 'aucun UPDATE ticket');
});
