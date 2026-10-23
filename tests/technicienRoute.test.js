// Tests de câblage des routes de la file du technicien (tâche 5.2).
// Les tests HTTP complets (tri de la file, Résolu sans commentaire → 400,
// transition refusée, autre technicien → 403) sont couverts par la tâche 5.3.
// On vérifie ici que les routes sont montées et protégées (auth +
// requireRole('technicien','admin')), que la file utilise bien le tri imposé
// et filtre sur le technicien courant, et que le PATCH relaie les paramètres
// attendus à ticketService.changerStatut.
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

let dernieresRequetes = [];

function fakeQuery(text, params) {
  dernieresRequetes.push({ text, params });
  // File du technicien : renvoie une liste vide (le tri est vérifié sur le SQL).
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

function jeton(role, id = 2) {
  return jwt.sign({ id, nom: 'Test', role }, config.jwtSecret, { expiresIn: '1h' });
}

test('GET /api/technicien/tickets sans jeton renvoie 401', async () => {
  const res = await request(app).get('/api/technicien/tickets');
  assert.strictEqual(res.status, 401);
});

test('GET /api/technicien/tickets avec un rôle etudiant renvoie 403', async () => {
  const res = await request(app)
    .get('/api/technicien/tickets')
    .set('Authorization', `Bearer ${jeton('etudiant')}`);
  assert.strictEqual(res.status, 403);
});

test('GET /api/technicien/tickets (technicien) filtre sur le technicien courant et applique le tri imposé', async () => {
  dernieresRequetes = [];
  const res = await request(app)
    .get('/api/technicien/tickets')
    .set('Authorization', `Bearer ${jeton('technicien', 42)}`);

  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { tickets: [] });

  const requeteFile = dernieresRequetes.find((r) => /FROM ticket/.test(r.text));
  assert.ok(requeteFile, 'la route doit interroger la table ticket');
  // Filtre sur le technicien courant et exclusion des résolus.
  assert.match(requeteFile.text, /t\.technicien_id = \$1/);
  assert.match(requeteFile.text, /t\.statut <> 'Résolu'/);
  assert.deepStrictEqual(requeteFile.params, [42]);
  // Tri imposé par design.md.
  assert.match(
    requeteFile.text,
    /CASE t\.priorite\s+WHEN 'Critique' THEN 1\s+WHEN 'Haute' THEN 2\s+WHEN 'Normale' THEN 3\s+ELSE 4\s+END,\s+t\.cree_le ASC/
  );
});

test('GET /api/technicien/tickets (admin) est autorisé', async () => {
  const res = await request(app)
    .get('/api/technicien/tickets')
    .set('Authorization', `Bearer ${jeton('admin')}`);
  assert.strictEqual(res.status, 200);
});

test('PATCH /api/tickets/:id/statut sans jeton renvoie 401', async () => {
  const res = await request(app)
    .patch('/api/tickets/1/statut')
    .send({ statut: 'En cours' });
  assert.strictEqual(res.status, 401);
});

test('PATCH /api/tickets/:id/statut avec un rôle etudiant renvoie 403', async () => {
  const res = await request(app)
    .patch('/api/tickets/1/statut')
    .set('Authorization', `Bearer ${jeton('etudiant')}`)
    .send({ statut: 'En cours' });
  assert.strictEqual(res.status, 403);
});
