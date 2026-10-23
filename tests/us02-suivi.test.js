// Tests HTTP de l'US-02 — Suivre sa demande (tâche 6.1).
// Couvre, de façon minimale et non redondante avec la tâche 6.4 :
//   3.1 — « Mes demandes » ne liste QUE les tickets de l'auteur courant
//         (filtre SQL auteur_id = req.user.id), du plus récent au plus ancien.
//   3.3 — RG-06 : un étudiant qui demande le ticket d'un autre étudiant → 403.
//   3.2 — le détail renvoie une URL présignée de la photo (s3Service mocké).
//
// Vérifie aussi l'ordonnancement des routes : « /mes-tickets » doit être pris
// en charge par sa route dédiée et NON interprété comme « /:id ».
//
// La base et s3Service sont mockés en remplaçant les modules dans le cache de
// require AVANT de charger l'application (voir design.md « Testing Strategy »).
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');

// --- Mock du module s3Service (aucun appel AWS réel) ------------------------
const cheminS3 = require.resolve('../src/services/s3Service');
let derniereCleePresignee; // mémorise la clé passée à urlPresignee
require.cache[cheminS3] = {
  id: cheminS3,
  filename: cheminS3,
  loaded: true,
  exports: {
    // Middleware multer factice (non utilisé par les GET, requis à l'import).
    uploadPhoto: (req, res, next) => next(),
    televerserPhoto: async () => 'photos/fake.jpg',
    erreurUploadEnFrancais: () => null,
    urlPresignee: async (cle) => {
      derniereCleePresignee = cle;
      return cle ? `https://signed.example/${cle}` : null;
    },
  },
};

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

let dernierJournal = [];
// Ticket simulé renvoyé par le SELECT ... FROM ticket WHERE t.id = $1.
let ticketSimule = null;

function fakeQuery(text, params) {
  dernierJournal.push({ text, params });
  if (/FROM ticket t/.test(text) && /WHERE t\.id = \$1/.test(text)) {
    return Promise.resolve({ rows: ticketSimule ? [ticketSimule] : [] });
  }
  if (/FROM ticket t/.test(text) && /WHERE t\.auteur_id = \$1/.test(text)) {
    // Liste « mes demandes » : renvoyée telle quelle (tri assuré par le SQL).
    return Promise.resolve({
      rows: [
        { id: 1, numero: 'INC-2026-00002', categorie: 'Problème réseau', batiment: 'B', salle: 'B204', statut: 'Ouvert', maj_le: '2026-02-02T08:00:00Z' },
        { id: 2, numero: 'INC-2026-00001', categorie: 'Salle fermée', batiment: 'A', salle: 'A12', statut: 'Résolu', maj_le: '2026-01-01T08:00:00Z' },
      ],
    });
  }
  if (/FROM historique_ticket/.test(text)) {
    return Promise.resolve({
      rows: [
        { id: 1, acteur_id: 1, acteur: 'Léa', ancien_statut: null, nouveau_statut: 'Ouvert', commentaire: 'Signalement créé.', date: '2026-01-01T08:00:00Z' },
      ],
    });
  }
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

const LEA_ID = 1; // étudiante, auteure des tickets
const TOM_ID = 4; // autre étudiant (RG-06)
const KARIM_ID = 2; // technicien assigné

function jeton(role, id) {
  return jwt.sign({ id, nom: 'Test', role }, config.jwtSecret, { expiresIn: '1h' });
}

test.beforeEach(() => {
  dernierJournal.length = 0;
  ticketSimule = null;
  derniereCleePresignee = undefined;
});

// --- Exigence 3.1 : « Mes demandes » filtre sur l'auteur courant ------------
test('GET /api/tickets/mes-tickets filtre sur l’auteur courant et trie par cree_le DESC (req 3.1)', async () => {
  const res = await request(app)
    .get('/api/tickets/mes-tickets')
    .set('Authorization', `Bearer ${jeton('etudiant', LEA_ID)}`);

  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body.tickets), 'la réponse expose un tableau tickets');
  assert.strictEqual(res.body.tickets.length, 2);

  const requeteListe = dernierJournal.find((r) => /WHERE t\.auteur_id = \$1/.test(r.text));
  assert.ok(requeteListe, 'la liste filtre sur auteur_id');
  // Filtre explicite sur l'auteur courant : la clause restreint à auteur_id et
  // le seul paramètre lié est l'id de l'utilisateur connecté → aucun autre
  // auteur ne peut apparaître dans le résultat (req 3.1).
  assert.deepStrictEqual(requeteListe.params, [LEA_ID], 'le seul paramètre est l’id de l’utilisateur courant');
  assert.match(requeteListe.text, /WHERE t\.auteur_id = \$1/);
  // Pas d'autre filtre sur auteur_id (ex. OR auteur_id ...) qui élargirait le périmètre.
  assert.strictEqual((requeteListe.text.match(/auteur_id/g) || []).length, 1, 'un seul filtre auteur_id, sans élargissement');
  assert.match(requeteListe.text, /ORDER BY t\.cree_le DESC/);
  // La route dédiée a bien été choisie, pas « /:id ».
  assert.ok(!dernierJournal.some((r) => /WHERE t\.id = \$1/.test(r.text)), 'ne doit pas être traité comme /:id');
});

test('GET /api/tickets/mes-tickets réservé aux étudiants (technicien → 403)', async () => {
  const res = await request(app)
    .get('/api/tickets/mes-tickets')
    .set('Authorization', `Bearer ${jeton('technicien', KARIM_ID)}`);
  assert.strictEqual(res.status, 403);
});

// --- Exigence 3.3 : RG-06 — ticket d'un autre étudiant → 403 ----------------
test('GET /api/tickets/:id par un autre étudiant renvoie 403 (RG-06, req 3.3)', async () => {
  ticketSimule = {
    id: 10,
    numero: 'INC-2026-00010',
    description: 'Vidéoprojecteur en panne',
    statut: 'Ouvert',
    priorite: 'Normale',
    origine: 'formulaire',
    en_retard: false,
    photo_cle: null,
    cree_le: '2026-01-01T08:00:00Z',
    maj_le: '2026-01-01T08:00:00Z',
    resolu_le: null,
    auteur_id: LEA_ID,
    technicien_id: KARIM_ID,
    categorie: 'Matériel défectueux',
    batiment: 'B',
    salle: 'B204',
  };

  const res = await request(app)
    .get('/api/tickets/10')
    .set('Authorization', `Bearer ${jeton('etudiant', TOM_ID)}`);

  assert.strictEqual(res.status, 403);
  // Le refus porte un message d'erreur explicite en français (req 3.3 / RG-06).
  assert.strictEqual(typeof res.body.error, 'string');
  assert.ok(res.body.error.length > 0, 'un message d’erreur français doit être renvoyé');
  assert.match(res.body.error, /autorisé/i, 'le message de refus est en français');
  // L'historique ne doit pas avoir été chargé après le refus.
  assert.ok(!dernierJournal.some((r) => /FROM historique_ticket/.test(r.text)), 'pas de chargement d’historique après refus');
});

// --- Exigence 3.2 : détail pour l'auteur avec photo présignée ---------------
test('GET /api/tickets/:id pour l’auteur renvoie le détail, photoUrl présignée et historique chronologique (req 3.2)', async () => {
  ticketSimule = {
    id: 11,
    numero: 'INC-2026-00011',
    description: 'Fuite d’eau',
    statut: 'En cours',
    priorite: 'Normale',
    origine: 'formulaire',
    en_retard: false,
    photo_cle: 'photos/INC-2026-00011-123.jpg',
    cree_le: '2026-01-01T08:00:00Z',
    maj_le: '2026-01-02T08:00:00Z',
    resolu_le: null,
    auteur_id: LEA_ID,
    technicien_id: KARIM_ID,
    categorie: 'Salle fermée',
    batiment: 'A',
    salle: 'A12',
  };

  const res = await request(app)
    .get('/api/tickets/11')
    .set('Authorization', `Bearer ${jeton('etudiant', LEA_ID)}`);

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.numero, 'INC-2026-00011');
  // photoUrl présignée via s3Service mocké, et clé S3 brute non exposée.
  assert.strictEqual(res.body.photoUrl, 'https://signed.example/photos/INC-2026-00011-123.jpg');
  assert.strictEqual(derniereCleePresignee, 'photos/INC-2026-00011-123.jpg');
  assert.strictEqual(res.body.photo_cle, undefined, 'la clé S3 ne doit pas être exposée');
  // Historique présent, trié chronologiquement par le SQL.
  assert.ok(Array.isArray(res.body.historique));
  const requeteHist = dernierJournal.find((r) => /FROM historique_ticket/.test(r.text));
  assert.ok(requeteHist, 'l’historique est chargé');
  assert.match(requeteHist.text, /ORDER BY h\.cree_le ASC/);
});
