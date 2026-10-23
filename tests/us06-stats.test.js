// Tests ciblés de l'US-06 — Tableau de bord (tâche 8.3).
// Couvre explicitement :
//   - exigence 7.5 (RG-15) : un étudiant OU un technicien appelant les
//     statistiques reçoit 403 ; un admin reste autorisé (200) ;
//   - exigence 7.3 (RG-14) : le délai moyen de résolution est calculé comme
//     `resolu_le − cree_le` en heures, sur les tickets RÉSOLUS uniquement, et
//     la valeur renvoyée par le service est l'AVG arrondie à 1 décimale
//     (null s'il n'y a aucun ticket résolu sur la période).
//
// Pour obtenir un test de calcul VÉRITABLEMENT « sur un jeu connu », le faux
// db.query n'injecte pas un délai arbitraire : il reçoit un jeu de tickets
// concret (cree_le / resolu_le / statut) et calcule lui-même l'AVG des écarts
// horaires sur les seuls tickets résolus — en répliquant côté test la sémantique
// SQL (EXTRACT(EPOCH FROM (resolu_le − cree_le)) / 3600). On vérifie alors que
// le service relaie cette moyenne, arrondie à 1 décimale.
//
// La base est mockée en remplaçant ../src/db dans le cache de require AVANT de
// charger l'app et le service (voir design.md « Testing Strategy », comme
// tests/statsService.test.js et tests/statsRoute.test.js). Ce fichier est
// exécuté dans son propre processus par `node --test`, donc ses mocks de
// require.cache n'entrent pas en conflit avec ceux des autres fichiers.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');

// --- Jeu de tickets connu, piloté par chaque test ---------------------------
// Chaque ligne : { cree_le, resolu_le, statut }. Seules les lignes résolues
// (statut === 'Résolu' ET resolu_le non null) comptent dans le délai moyen.
let ticketsResolus = [];

// Calcule l'AVG des écarts horaires (resolu_le − cree_le) sur les tickets
// résolus uniquement — réplique de la sémantique SQL de statsService. Renvoie
// null si aucun ticket résolu (comportement de AVG() sur un ensemble vide).
function avgDelaiHeuresConnu() {
  const resolus = ticketsResolus.filter(
    (t) => t.statut === 'Résolu' && t.resolu_le != null
  );
  if (resolus.length === 0) {
    return null;
  }
  const sommeHeures = resolus.reduce((acc, t) => {
    const deltaMs = new Date(t.resolu_le).getTime() - new Date(t.cree_le).getTime();
    return acc + deltaMs / 3600000; // ms → heures
  }, 0);
  return sommeHeures / resolus.length;
}

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

function fakeQuery(text /* , params */) {
  // Requête de délai moyen : renvoie l'AVG calculée sur le jeu connu.
  if (/delai_moyen_heures/.test(text)) {
    return Promise.resolve({ rows: [{ delai_moyen_heures: avgDelaiHeuresConnu() }] });
  }
  // Total général (utile pour la route admin 200).
  if (/COUNT\(\*\)::int AS total\s+FROM ticket t\s+WHERE/.test(text)) {
    return Promise.resolve({ rows: [{ total: ticketsResolus.length }] });
  }
  // Agrégats catégorie / lieu / statut : liste vide suffit ici.
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

// Charger l'app ET le service APRÈS avoir injecté le mock.
const app = require('../src/app');
delete require.cache[require.resolve('../src/services/statsService')];
const statsService = require('../src/services/statsService');

function jeton(role, id = 1) {
  return jwt.sign({ id, nom: 'Test US06', role }, config.jwtSecret, { expiresIn: '1h' });
}

test.beforeEach(() => {
  ticketsResolus = [];
});

// ===========================================================================
// Exigence 7.5 (RG-15) : accès aux statistiques réservé à l'admin.
// ===========================================================================
test('GET /api/stats avec un jeton étudiant renvoie 403 (req 7.5, RG-15)', async () => {
  const res = await request(app)
    .get('/api/stats')
    .set('Authorization', `Bearer ${jeton('etudiant')}`);
  assert.strictEqual(res.status, 403);
  assert.ok(res.body.error, 'un message d’erreur doit accompagner le 403');
});

test('GET /api/stats avec un jeton technicien renvoie 403 (req 7.5, RG-15)', async () => {
  const res = await request(app)
    .get('/api/stats')
    .set('Authorization', `Bearer ${jeton('technicien')}`);
  assert.strictEqual(res.status, 403);
  assert.ok(res.body.error, 'un message d’erreur doit accompagner le 403');
});

test('GET /api/stats avec un jeton admin reste autorisé (200) (req 7.5)', async () => {
  const res = await request(app)
    .get('/api/stats')
    .set('Authorization', `Bearer ${jeton('admin')}`);
  assert.strictEqual(res.status, 200);
});

// ===========================================================================
// Exigence 7.3 (RG-14) : délai moyen = resolu_le − cree_le (heures), résolus
// uniquement. Calcul vérifié sur un jeu de tickets connu.
// ===========================================================================
test('le délai moyen vaut 36.0 h sur un jeu connu (24 h + 48 h) et exclut les non résolus (req 7.3, RG-14)', async () => {
  // Jeu connu : deux tickets résolus (24 h et 48 h → moyenne 36 h) plus un
  // ticket « En cours » de 100 h qui NE DOIT PAS être compté.
  ticketsResolus = [
    { cree_le: '2026-01-01T00:00:00Z', resolu_le: '2026-01-02T00:00:00Z', statut: 'Résolu' }, // 24 h
    { cree_le: '2026-01-01T00:00:00Z', resolu_le: '2026-01-03T00:00:00Z', statut: 'Résolu' }, // 48 h
    { cree_le: '2026-01-01T00:00:00Z', resolu_le: '2026-01-05T04:00:00Z', statut: 'En cours' }, // exclu
  ];

  const stats = await statsService.calculerStats('mois');
  assert.strictEqual(stats.delaiMoyenHeures, 36.0);
});

test('le délai moyen est arrondi à 1 décimale sur un jeu connu (10 h + 11 h + 12 h → 11.0) (req 7.3)', async () => {
  // Trois tickets résolus de 10, 11 et 12 h → moyenne exacte 11.0 h.
  ticketsResolus = [
    { cree_le: '2026-02-01T00:00:00Z', resolu_le: '2026-02-01T10:00:00Z', statut: 'Résolu' }, // 10 h
    { cree_le: '2026-02-01T00:00:00Z', resolu_le: '2026-02-01T11:00:00Z', statut: 'Résolu' }, // 11 h
    { cree_le: '2026-02-01T00:00:00Z', resolu_le: '2026-02-01T12:00:00Z', statut: 'Résolu' }, // 12 h
  ];

  const stats = await statsService.calculerStats('mois');
  assert.strictEqual(stats.delaiMoyenHeures, 11.0);
});

test('le délai moyen produit une décimale non triviale sur un jeu connu (1 h + 2 h → 1.5) (req 7.3)', async () => {
  ticketsResolus = [
    { cree_le: '2026-03-01T00:00:00Z', resolu_le: '2026-03-01T01:00:00Z', statut: 'Résolu' }, // 1 h
    { cree_le: '2026-03-01T00:00:00Z', resolu_le: '2026-03-01T02:00:00Z', statut: 'Résolu' }, // 2 h
  ];

  const stats = await statsService.calculerStats('mois');
  assert.strictEqual(stats.delaiMoyenHeures, 1.5);
});

test('le délai moyen est null quand le jeu ne contient aucun ticket résolu (req 7.3)', async () => {
  // Uniquement des tickets non résolus → AVG sur ensemble vide → null.
  ticketsResolus = [
    { cree_le: '2026-04-01T00:00:00Z', resolu_le: null, statut: 'Ouvert' },
    { cree_le: '2026-04-01T00:00:00Z', resolu_le: null, statut: 'En cours' },
  ];

  const stats = await statsService.calculerStats('mois');
  assert.strictEqual(stats.delaiMoyenHeures, null);
});
