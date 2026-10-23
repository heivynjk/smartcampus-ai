const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../src/app');

test('GET /api/sante renvoie { ok: true }', async () => {
  const res = await request(app).get('/api/sante');
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { ok: true });
});

test('une route /api inconnue renvoie 404 avec un message', async () => {
  const res = await request(app).get('/api/inconnue');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error, 'Ressource introuvable');
});
