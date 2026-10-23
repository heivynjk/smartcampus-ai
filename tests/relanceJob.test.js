// Tests unitaires de la relance des tickets non pris en charge (tâche 10, US 8).
// La base est mockée : on remplace le module ../src/db dans le cache de require
// avant de charger le service (voir design.md « Testing Strategy »).
//
// Le faux client transactionnel :
//   - enregistre chaque requête (texte + paramètres) dans un journal ;
//   - simule l'UPDATE ... RETURNING à partir d'un ensemble de tickets en base,
//     en respectant le filtre (statut Ouvert, en_retard = false, > 24 h) et en
//     passant les tickets relancés à `en_retard = true` (ce qui garantit
//     l'idempotence : un deuxième appel ne les re-sélectionne plus).
const test = require('node:test');
const assert = require('node:assert');

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

// Tickets simulés « en base ». Chaque test les réinitialise via poserTickets().
let ticketsEnBase = [];
// Journal des requêtes de la connexion courante, réinitialisé avant chaque test.
let dernierJournal = [];

// Un ticket est éligible à la relance s'il est Ouvert, pas déjà en retard et
// créé il y a plus de 24 h (reproduit le filtre SQL côté mock).
function estEligible(t) {
  const vingtQuatreHeures = 24 * 60 * 60 * 1000;
  const age = Date.now() - new Date(t.cree_le).getTime();
  return t.statut === 'Ouvert' && t.en_retard === false && age > vingtQuatreHeures;
}

function fabriquerClient(journal) {
  return {
    async query(text, params) {
      journal.push({ text, params });
      const sql = text.trim();
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql)) {
        return { rows: [] };
      }
      if (/^UPDATE ticket/.test(sql)) {
        // Sélectionne les tickets éligibles, les marque en retard et les renvoie.
        const relances = ticketsEnBase.filter(estEligible);
        for (const t of relances) {
          t.en_retard = true;
        }
        return {
          rows: relances.map((t) => ({
            id: t.id,
            numero: t.numero,
            auteur_id: t.auteur_id,
          })),
        };
      }
      if (/INSERT INTO notification/.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {},
  };
}

const fakePool = {
  connect: async () => fabriquerClient(dernierJournal),
};
require.cache[cheminDb] = {
  id: cheminDb,
  filename: cheminDb,
  loaded: true,
  exports: { pool: fakePool, query: fakePool.query },
};

// Charger le service APRÈS avoir injecté le mock.
delete require.cache[require.resolve('../src/services/relanceJob')];
const relanceJob = require('../src/services/relanceJob');
const { relancer } = relanceJob;

// Fabrique un ticket simulé. `ageHeures` fixe l'ancienneté de `cree_le`.
function faireTicket({
  id,
  numero = `INC-2026-${String(id).padStart(5, '0')}`,
  auteurId = 1,
  statut = 'Ouvert',
  enRetard = false,
  ageHeures = 48,
} = {}) {
  return {
    id,
    numero,
    auteur_id: auteurId,
    statut,
    en_retard: enRetard,
    cree_le: new Date(Date.now() - ageHeures * 60 * 60 * 1000),
  };
}

function poserTickets(tickets) {
  ticketsEnBase = tickets;
}

test.beforeEach(() => {
  dernierJournal.length = 0;
  ticketsEnBase = [];
});

// --- Filtre de l'UPDATE : Ouvert, non en_retard, > 24 h ---------------------
test("relancer n'agit que sur les tickets Ouvert, non relancés et âgés de plus de 24 h (exigence 8.2)", async () => {
  poserTickets([
    faireTicket({ id: 1, auteurId: 10, ageHeures: 48 }), // éligible
    faireTicket({ id: 2, auteurId: 20, statut: 'En cours', ageHeures: 48 }), // pas Ouvert
    faireTicket({ id: 3, auteurId: 30, statut: 'Résolu', ageHeures: 72 }), // pas Ouvert
    faireTicket({ id: 4, auteurId: 40, ageHeures: 2 }), // trop récent
    faireTicket({ id: 5, auteurId: 50, enRetard: true, ageHeures: 72 }), // déjà relancé
  ]);

  const res = await relancer();

  assert.strictEqual(res.nombre, 1, 'un seul ticket éligible');
  assert.deepStrictEqual(
    res.tickets.map((t) => t.id),
    [1]
  );

  // L'UPDATE doit porter sur les trois conditions du filtre.
  const update = dernierJournal.find((q) => /^UPDATE ticket/.test(q.text.trim()));
  assert.ok(update, 'un UPDATE ticket doit être exécuté');
  assert.match(update.text, /statut = 'Ouvert'/);
  assert.match(update.text, /en_retard = false/);
  assert.match(update.text, /cree_le < now\(\) - interval '24 hours'/);
  assert.match(update.text, /SET\s+en_retard = true/);
});

// --- Une notification par ticket relancé, pour l'auteur (exigence 8.2) ------
test("relancer crée une notification par ticket relancé, destinée à l'auteur (exigence 8.2)", async () => {
  poserTickets([
    faireTicket({ id: 1, numero: 'INC-2026-00001', auteurId: 10, ageHeures: 48 }),
    faireTicket({ id: 2, numero: 'INC-2026-00002', auteurId: 20, ageHeures: 30 }),
  ]);

  const res = await relancer();
  assert.strictEqual(res.nombre, 2);

  const notifs = dernierJournal.filter((q) => /INSERT INTO notification/.test(q.text));
  assert.strictEqual(notifs.length, 2, 'une notification par ticket relancé');

  // Chaque notification vise l'auteur, référence le ticket et son numéro.
  const notif1 = notifs.find((n) => n.params[1] === 1);
  assert.ok(notif1, 'notification pour le ticket 1');
  assert.strictEqual(notif1.params[0], 10, "destinée à l'auteur du ticket");
  assert.ok(notif1.params[2].includes('INC-2026-00001'));
  assert.match(notif1.params[2], /pas encore été pris en charge/);

  const notif2 = notifs.find((n) => n.params[1] === 2);
  assert.strictEqual(notif2.params[0], 20);
});

// --- Aucun ticket éligible : aucune notification ----------------------------
test('relancer ne crée aucune notification quand aucun ticket n\'est éligible', async () => {
  poserTickets([
    faireTicket({ id: 1, ageHeures: 2 }), // trop récent
    faireTicket({ id: 2, statut: 'En cours', ageHeures: 72 }), // pas Ouvert
  ]);

  const res = await relancer();
  assert.strictEqual(res.nombre, 0);
  assert.deepStrictEqual(res.tickets, []);
  assert.strictEqual(
    dernierJournal.filter((q) => /INSERT INTO notification/.test(q.text)).length,
    0
  );
});

// --- Idempotence : relance unique par ticket (exigence 8.3) -----------------
test('relancer est idempotent : un deuxième appel ne re-notifie pas les tickets déjà relancés (exigence 8.3)', async () => {
  poserTickets([
    faireTicket({ id: 1, auteurId: 10, ageHeures: 48 }),
    faireTicket({ id: 2, auteurId: 20, ageHeures: 72 }),
  ]);

  // Premier appel : les deux tickets sont relancés et passent en_retard = true.
  const premier = await relancer();
  assert.strictEqual(premier.nombre, 2);

  // Deuxième appel (nouveau journal) : plus aucun ticket éligible.
  dernierJournal.length = 0;
  const second = await relancer();
  assert.strictEqual(second.nombre, 0, 'aucune nouvelle relance');
  assert.deepStrictEqual(second.tickets, []);
  assert.strictEqual(
    dernierJournal.filter((q) => /INSERT INTO notification/.test(q.text)).length,
    0,
    'aucune nouvelle notification'
  );
});

// --- La transaction est validée (COMMIT) ------------------------------------
test('relancer valide la transaction (COMMIT)', async () => {
  poserTickets([faireTicket({ id: 1, ageHeures: 48 })]);
  await relancer();
  const sqls = dernierJournal.map((q) => q.text.trim());
  assert.ok(sqls.includes('BEGIN'), 'transaction ouverte');
  assert.ok(sqls.includes('COMMIT'), 'transaction validée');
});

// --- Le service expose relancer() et demarrer(), sans démarrer de cron réel --
test('le module expose relancer() et demarrer()', () => {
  assert.strictEqual(typeof relanceJob.relancer, 'function');
  assert.strictEqual(typeof relanceJob.demarrer, 'function');
});

// --- app.js ne doit PAS importer relanceJob (pas de cron en test) -----------
test("app.js ne requiert pas relanceJob (le cron ne tourne pas pendant les tests)", () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const contenuApp = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(!/relanceJob/.test(contenuApp), 'app.js ne doit pas référencer relanceJob');
});
