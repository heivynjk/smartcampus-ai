// Tests d'authentification et de contrôle de rôle (tâche 3).
// La base est mockée : on remplace le module ../src/db dans le cache de require
// avant de charger l'application (voir design.md « Testing Strategy »).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const request = require('supertest');

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

// Un seul utilisateur de démo (mot de passe « demo1234 »).
const hashDemo = bcrypt.hashSync('demo1234', 10);
const utilisateurs = [
  { id: 1, nom: 'Léa Martin', role: 'etudiant', email: 'lea@campus.fr', mot_de_passe_hash: hashDemo },
];

function fakeQuery(text, params) {
  // Connexion : SELECT ... FROM utilisateur WHERE email = $1
  if (/FROM utilisateur WHERE email/.test(text)) {
    const u = utilisateurs.find((x) => x.email === params[0]);
    return Promise.resolve({ rows: u ? [u] : [] });
  }
  // Référentiels.
  if (/FROM categorie/.test(text)) {
    return Promise.resolve({ rows: [{ id: 1, libelle: 'Salle fermée', priorite_defaut: 'Normale' }] });
  }
  if (/FROM lieu/.test(text)) {
    return Promise.resolve({ rows: [{ id: 1, batiment: 'A', salle: 'A12' }] });
  }
  return Promise.resolve({ rows: [] });
}

require.cache[cheminDb] = {
  id: cheminDb,
  filename: cheminDb,
  loaded: true,
  exports: { pool: { query: fakeQuery }, query: fakeQuery },
};

// Charger l'app APRÈS avoir injecté le mock.
const app = require('../src/app');
const requireRole = require('../src/middleware/requireRole');

// --- POST /api/auth/login ---------------------------------------------------
test('login avec des identifiants valides renvoie un jeton et l’utilisateur', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'lea@campus.fr', motDePasse: 'demo1234' });

  assert.strictEqual(res.status, 200);
  assert.ok(res.body.token, 'un jeton doit être présent');
  assert.deepStrictEqual(res.body.utilisateur, { id: 1, nom: 'Léa Martin', role: 'etudiant' });
});

test('login avec un mauvais mot de passe renvoie 401 « Identifiants invalides »', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'lea@campus.fr', motDePasse: 'mauvais' });

  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, 'Identifiants invalides');
});

test('login avec un e-mail inconnu renvoie 401 « Identifiants invalides »', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'inconnu@campus.fr', motDePasse: 'demo1234' });

  assert.strictEqual(res.status, 401);
  assert.strictEqual(res.body.error, 'Identifiants invalides');
});

// --- Route protégée sans jeton ---------------------------------------------
test('GET /api/referentiels sans jeton renvoie 401', async () => {
  const res = await request(app).get('/api/referentiels');
  assert.strictEqual(res.status, 401);
});

test('GET /api/referentiels avec un jeton valide renvoie categories et lieux', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'lea@campus.fr', motDePasse: 'demo1234' });

  const res = await request(app)
    .get('/api/referentiels')
    .set('Authorization', `Bearer ${login.body.token}`);

  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.categories));
  assert.ok(Array.isArray(res.body.lieux));
});

test('GET /api/referentiels avec un jeton invalide renvoie 401', async () => {
  const res = await request(app)
    .get('/api/referentiels')
    .set('Authorization', 'Bearer jeton-bidon');
  assert.strictEqual(res.status, 401);
});

// --- requireRole : rôle non autorisé → 403 ---------------------------------
test('requireRole refuse un rôle non autorisé avec 403', () => {
  const mw = requireRole('admin');
  let statut = null;
  let corps = null;
  const res = {
    status(code) { statut = code; return this; },
    json(obj) { corps = obj; return this; },
  };
  let suivantAppele = false;
  mw({ user: { id: 1, role: 'etudiant' } }, res, () => { suivantAppele = true; });

  assert.strictEqual(suivantAppele, false);
  assert.strictEqual(statut, 403);
  assert.strictEqual(corps.error, 'Accès interdit pour votre rôle');
});

test('requireRole laisse passer un rôle autorisé', () => {
  const mw = requireRole('admin', 'technicien');
  let suivantAppele = false;
  mw({ user: { id: 2, role: 'technicien' } }, {}, () => { suivantAppele = true; });
  assert.strictEqual(suivantAppele, true);
});
