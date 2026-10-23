// Tests HTTP de bout en bout de POST /api/tickets (US-01, tâche 4.4).
// Couvre les exigences 2.1 (création OK), 2.2 (champ manquant → 400) et
// 2.6 (catégorie « Sécurité » → priorité « Critique »).
//
// La base est mockée en remplaçant le module ../src/db dans le cache de require
// AVANT de charger l'application (voir design.md « Testing Strategy », comme
// tests/auth.test.js et tests/ticketsRoute.test.js). Le faux client
// transactionnel reprend le motif de tests/ticketService.test.js : il journalise
// chaque requête exécutée et simule les INSERT ... RETURNING, afin de vérifier
// que la route déclenche bien l'INSERT ticket, l'INSERT historique et l'INSERT
// notification, et d'inspecter les paramètres capturés.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

// Catégories de démo : une « normale » (id 2) et « Sécurité » (id 4).
const categories = {
  2: { libelle: 'Matériel défectueux', priorite_defaut: 'Normale', technicien_referent_id: 2 },
  4: { libelle: 'Sécurité', priorite_defaut: 'Critique', technicien_referent_id: 2 },
};

// Journal courant des requêtes (réinitialisé avant chaque test).
let dernierJournal = [];

// Faux client transactionnel : journalise et simule les INSERT ... RETURNING.
function fabriquerClient(journal) {
  let compteurTicket = 100;
  return {
    async query(text, params) {
      journal.push({ text, params });
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(text.trim())) {
        return { rows: [] };
      }
      if (/FROM categorie WHERE id/.test(text)) {
        const c = categories[params[0]];
        return { rows: c ? [c] : [] };
      }
      if (/INSERT INTO ticket/.test(text)) {
        compteurTicket += 1;
        const numero = `INC-2026-${String(compteurTicket).padStart(5, '0')}`;
        return { rows: [{ id: compteurTicket, numero, statut: 'Ouvert' }] };
      }
      return { rows: [] };
    },
    release() {},
  };
}

const fakePool = {
  connect: async () => fabriquerClient(dernierJournal),
};
function fakeQuery(text, params) {
  dernierJournal.push({ text, params });
  return Promise.resolve({ rows: [] });
}
require.cache[cheminDb] = {
  id: cheminDb,
  filename: cheminDb,
  loaded: true,
  exports: { pool: fakePool, query: fakeQuery },
};

// Charger l'app APRÈS avoir injecté le mock.
const app = require('../src/app');

function jeton(role) {
  return jwt.sign({ id: 1, nom: 'Test', role }, config.jwtSecret, { expiresIn: '1h' });
}

test.beforeEach(() => {
  dernierJournal.length = 0;
});

// --- Exigence 2.1 : création OK --------------------------------------------
test('POST /api/tickets (etudiant) avec des champs valides renvoie 201 et crée le ticket (req 2.1)', async () => {
  const res = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${jeton('etudiant')}`)
    .field('categorieId', '2')
    .field('lieuId', '3')
    .field('description', 'Vidéoprojecteur HS en B204');

  assert.strictEqual(res.status, 201);
  assert.ok(res.body.id, 'un id doit être renvoyé');
  assert.match(res.body.numero, /^INC-\d{4}-\d{5}$/);
  assert.strictEqual(res.body.statut, 'Ouvert');

  // Le ticket, l'historique et la notification ont bien été insérés.
  const sqls = dernierJournal.map((q) => q.text);
  assert.ok(sqls.some((s) => /INSERT INTO ticket/.test(s)), 'INSERT ticket exécuté');
  assert.ok(sqls.some((s) => /INSERT INTO historique_ticket/.test(s)), 'INSERT historique exécuté');
  assert.ok(sqls.some((s) => /INSERT INTO notification/.test(s)), 'INSERT notification exécuté');
  assert.ok(sqls.includes('COMMIT'), 'transaction validée');
});

// --- Exigence 2.2 : champ manquant → 400 -----------------------------------
test('POST /api/tickets (etudiant) sans description renvoie 400 avec un message (req 2.2)', async () => {
  const res = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${jeton('etudiant')}`)
    .field('categorieId', '2')
    .field('lieuId', '3');

  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error, 'un message d’erreur doit être renvoyé');
  // Aucun INSERT ne doit avoir eu lieu : la validation précède l'accès base.
  assert.ok(!dernierJournal.some((q) => /INSERT INTO ticket/.test(q.text)), 'aucun ticket inséré');
});

// --- Exigence 2.6 : catégorie « Sécurité » → priorité « Critique » ---------
test('POST /api/tickets (etudiant) pour la catégorie Sécurité force la priorité à Critique (req 2.6)', async () => {
  const res = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${jeton('etudiant')}`)
    .field('categorieId', '4')
    .field('lieuId', '6')
    .field('description', 'Porte de secours bloquée');

  assert.strictEqual(res.status, 201);

  const insert = dernierJournal.find((q) => /INSERT INTO ticket/.test(q.text));
  assert.ok(insert, 'INSERT ticket exécuté');
  // Paramètres : [description, categorieId, lieuId, auteurId, technicienId, priorite, photoCle, origine]
  assert.strictEqual(insert.params[5], 'Critique');
});
