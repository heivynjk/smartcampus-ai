// Tests HTTP des notifications (US-02, tâche 6.2, exigence 3.4).
// Couvre :
//   GET /api/notifications → { nonLues, items[] } filtrés sur l'utilisateur
//     courant (utilisateur_id = req.user.id), nonLues = nombre de lue = false.
//   POST /api/notifications/:id/lue → marque lue et renvoie 204.
//   POST /api/notifications/:id/lue sur la notification d'un autre utilisateur
//     → 404 (la clause utilisateur_id = $2 ne met rien à jour).
//
// La base est mockée en remplaçant le module db dans le cache de require
// AVANT de charger l'application (voir design.md « Testing Strategy »).
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

let dernierJournal = [];
// rowCount simulé pour l'UPDATE (0 = aucune ligne touchée → 404).
let updateRowCount = 1;

function fakeQuery(text, params) {
  dernierJournal.push({ text, params });

  if (/UPDATE notification/.test(text)) {
    return Promise.resolve({ rows: [], rowCount: updateRowCount });
  }

  if (/FROM notification/.test(text)) {
    return Promise.resolve({
      rows: [
        { id: 3, ticket_id: 10, message: 'Ticket pris en charge', lue: false, cree_le: '2026-02-03T08:00:00Z' },
        { id: 2, ticket_id: 10, message: 'Ticket résolu', lue: true, cree_le: '2026-02-02T08:00:00Z' },
        { id: 1, ticket_id: 11, message: 'Ticket pris en compte', lue: false, cree_le: '2026-02-01T08:00:00Z' },
      ],
    });
  }

  return Promise.resolve({ rows: [], rowCount: 0 });
}

require.cache[cheminDb] = {
  id: cheminDb,
  filename: cheminDb,
  loaded: true,
  exports: {
    pool: { query: fakeQuery, connect: async () => ({ query: fakeQuery, release() {} }) },
    query: fakeQuery,
  },
};

const app = require('../src/app');

const LEA_ID = 1; // étudiante
const KARIM_ID = 2; // technicien

function jeton(role, id) {
  return jwt.sign({ id, nom: 'Test', role }, config.jwtSecret, { expiresIn: '1h' });
}

test.beforeEach(() => {
  dernierJournal.length = 0;
  updateRowCount = 1;
});

test('GET /api/notifications sans jeton renvoie 401', async () => {
  const res = await request(app).get('/api/notifications');
  assert.strictEqual(res.status, 401);
});

test('GET /api/notifications renvoie nonLues et items filtrés sur l’utilisateur courant (req 3.4)', async () => {
  const res = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${jeton('etudiant', LEA_ID)}`);

  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.items), 'la réponse expose un tableau items');
  assert.strictEqual(res.body.items.length, 3);
  // Deux notifications lue = false dans le jeu simulé.
  assert.strictEqual(res.body.nonLues, 2);

  const requete = dernierJournal.find((r) => /FROM notification/.test(r.text));
  assert.ok(requete, 'la requête lit la table notification');
  assert.match(requete.text, /WHERE utilisateur_id = \$1/);
  assert.match(requete.text, /ORDER BY cree_le DESC/);
  assert.deepStrictEqual(requete.params, [LEA_ID]);
});

test('GET /api/notifications accessible à tous les rôles (technicien → 200)', async () => {
  const res = await request(app)
    .get('/api/notifications')
    .set('Authorization', `Bearer ${jeton('technicien', KARIM_ID)}`);
  assert.strictEqual(res.status, 200);
});

test('POST /api/notifications/:id/lue marque la notification lue et renvoie 204', async () => {
  updateRowCount = 1; // une ligne appartenant à l'utilisateur a été mise à jour
  const res = await request(app)
    .post('/api/notifications/3/lue')
    .set('Authorization', `Bearer ${jeton('etudiant', LEA_ID)}`);

  assert.strictEqual(res.status, 204);

  const requete = dernierJournal.find((r) => /UPDATE notification/.test(r.text));
  assert.ok(requete, 'un UPDATE est émis');
  assert.match(requete.text, /SET lue = true/);
  // Appartenance garantie par id = $1 AND utilisateur_id = $2.
  assert.match(requete.text, /WHERE id = \$1 AND utilisateur_id = \$2/);
  assert.deepStrictEqual(requete.params, ['3', LEA_ID]);
});

test('POST /api/notifications/:id/lue sur la notification d’un autre utilisateur renvoie 404', async () => {
  updateRowCount = 0; // aucune ligne : la clause utilisateur_id ne correspond pas
  const res = await request(app)
    .post('/api/notifications/3/lue')
    .set('Authorization', `Bearer ${jeton('etudiant', KARIM_ID)}`);

  assert.strictEqual(res.status, 404);
  assert.ok(res.body.error, 'un message d’erreur français est renvoyé');
});
