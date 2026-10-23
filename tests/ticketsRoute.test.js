// Tests de câblage de la route POST /api/tickets (tâche 4.3).
// Le test HTTP complet (création OK, champ manquant, Sécurité → Critique) est
// couvert par la tâche 4.4 ; on vérifie ici seulement que la route est bien
// montée et protégée (auth + rôle etudiant), et qu'un champ obligatoire
// manquant renvoie 400 (RG-01).
//
// La base est mockée (voir design.md « Testing Strategy ») : la validation des
// champs se fait avant tout accès à la base, donc un mock minimal suffit.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');
function fakeQuery() {
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

function jeton(role) {
  return jwt.sign({ id: 1, nom: 'Test', role }, config.jwtSecret, { expiresIn: '1h' });
}

test('POST /api/tickets sans jeton renvoie 401', async () => {
  const res = await request(app).post('/api/tickets').field('description', 'x');
  assert.strictEqual(res.status, 401);
});

test('POST /api/tickets avec un rôle technicien renvoie 403', async () => {
  const res = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${jeton('technicien')}`)
    .field('categorieId', '2')
    .field('lieuId', '3')
    .field('description', 'Test');
  assert.strictEqual(res.status, 403);
});

test('POST /api/tickets (etudiant) sans description renvoie 400 (RG-01)', async () => {
  const res = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${jeton('etudiant')}`)
    .field('categorieId', '2')
    .field('lieuId', '3');
  assert.strictEqual(res.status, 400);
  assert.ok(res.body.error);
});
