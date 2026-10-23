// Tests de câblage de la route du tableau de bord (tâche 8.2, US-06).
// Le calcul du délai moyen et les détails du 403 sont couverts par la tâche 8.3
// (service) ; on vérifie ici que la route est montée et protégée (auth +
// requireRole('admin')), que l'admin reçoit 200 avec la forme attendue, qu'un
// étudiant/technicien reçoit 403 (RG-15, exigence 7.5), et que la période du
// paramètre de requête est bien relayée à statsService (défaut 'mois').
//
// La base est mockée en remplaçant ../src/db dans le cache de require avant de
// charger l'application (voir design.md « Testing Strategy »).
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

// Journal des intervalles ($1) passés aux requêtes de stats.
let intervallesUtilises = [];

function fakeQuery(text, params) {
  if (params && params[0]) {
    intervallesUtilises.push(params[0]);
  }
  // Délai moyen.
  if (/delai_moyen_heures/.test(text)) {
    return Promise.resolve({ rows: [{ delai_moyen_heures: 12 }] });
  }
  // Total général.
  if (/COUNT\(\*\)::int AS total\s+FROM ticket t\s+WHERE/.test(text)) {
    return Promise.resolve({ rows: [{ total: 3 }] });
  }
  // Agrégats (catégorie / lieu / statut) : liste vide suffit pour le câblage.
  return Promise.resolve({ rows: [] });
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

function jeton(role, id = 1) {
  return jwt.sign({ id, nom: 'Admin Test', role }, config.jwtSecret, { expiresIn: '1h' });
}

test.beforeEach(() => {
  intervallesUtilises = [];
});

test('GET /api/stats sans jeton renvoie 401', async () => {
  const res = await request(app).get('/api/stats');
  assert.strictEqual(res.status, 401);
});

test('GET /api/stats avec un rôle etudiant renvoie 403 (RG-15)', async () => {
  const res = await request(app)
    .get('/api/stats')
    .set('Authorization', `Bearer ${jeton('etudiant')}`);
  assert.strictEqual(res.status, 403);
});

test('GET /api/stats avec un rôle technicien renvoie 403 (RG-15)', async () => {
  const res = await request(app)
    .get('/api/stats')
    .set('Authorization', `Bearer ${jeton('technicien')}`);
  assert.strictEqual(res.status, 403);
});

test('GET /api/stats (admin) renvoie 200 avec la forme attendue', async () => {
  const res = await request(app)
    .get('/api/stats')
    .set('Authorization', `Bearer ${jeton('admin')}`);

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(Object.keys(res.body).sort(), [
    'delaiMoyenHeures',
    'parCategorie',
    'parLieu',
    'parStatut',
    'total',
  ]);
  assert.strictEqual(res.body.total, 3);
});

test("GET /api/stats sans période utilise le défaut 'mois' (1 month)", async () => {
  await request(app).get('/api/stats').set('Authorization', `Bearer ${jeton('admin')}`);
  assert.ok(intervallesUtilises.length > 0, 'au moins une requête paramétrée exécutée');
  assert.ok(
    intervallesUtilises.every((iv) => iv === '1 month'),
    'toutes les requêtes utilisent le mois par défaut'
  );
});

test('GET /api/stats?periode=semaine relaie la période à statsService (7 days)', async () => {
  await request(app)
    .get('/api/stats?periode=semaine')
    .set('Authorization', `Bearer ${jeton('admin')}`);
  assert.ok(
    intervallesUtilises.every((iv) => iv === '7 days'),
    'la période semaine doit se traduire par un intervalle de 7 jours'
  );
});
