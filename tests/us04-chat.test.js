// Tests HTTP de la route POST /api/chat (tâche 7.2).
//
// Ces tests restent centrés sur la LOGIQUE DE MAPPING de la route :
//   - calcul de proposerSignalement = incidentDetecte || source === null ;
//   - résolution de prefill.categorieId / prefill.lieuId par correspondance
//     insensible à la casse dans les référentiels ;
//   - garde de rôle (non-etudiant → 403).
//
// bedrockService et db sont mockés via le cache de require AVANT de charger
// l'application (même motif que tests/us03-technicien.test.js) : aucun appel
// réel à AWS ni à la base. Les tests avec Bedrock mocké de bout en bout
// (question couverte / hors périmètre) relèvent de la tâche 7.4.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');

// --- Mock du service Bedrock ------------------------------------------------
const cheminBedrock = require.resolve('../src/services/bedrockService');

// Réponse que interroger() renverra ; configurée par chaque test.
let prochainResultat = null;
// Dernier appel observé (pour vérifier le passage de question/historique).
let dernierAppel = null;

require.cache[cheminBedrock] = {
  id: cheminBedrock,
  filename: cheminBedrock,
  loaded: true,
  exports: {
    interroger: async (args) => {
      dernierAppel = args;
      return prochainResultat;
    },
  },
};

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

// Référentiels de démo (cohérents avec db/seed.sql).
const categories = [
  { id: 1, libelle: 'Salle fermée' },
  { id: 2, libelle: 'Matériel défectueux' },
  { id: 3, libelle: 'Problème réseau' },
  { id: 4, libelle: 'Sécurité' },
  { id: 5, libelle: 'Autre' },
];
const lieux = [
  { id: 1, batiment: 'A', salle: 'A12' },
  { id: 2, batiment: 'A', salle: 'A14' },
  { id: 3, batiment: 'B', salle: 'B204' },
  { id: 4, batiment: 'B', salle: 'B210' },
  { id: 5, batiment: 'A', salle: 'Amphi A' },
  { id: 6, batiment: 'A', salle: 'Bibliothèque' },
];

require.cache[cheminDb] = {
  id: cheminDb,
  filename: cheminDb,
  loaded: true,
  exports: {
    pool: {},
    query: async (text) => {
      if (/FROM categorie/.test(text)) {
        return { rows: categories };
      }
      if (/FROM lieu/.test(text)) {
        return { rows: lieux };
      }
      return { rows: [] };
    },
  },
};

// Charger l'app APRÈS avoir injecté les mocks.
const app = require('../src/app');

function jeton(role, id = 1) {
  return jwt.sign({ id, nom: 'Test', role }, config.jwtSecret, { expiresIn: '1h' });
}

test.beforeEach(() => {
  prochainResultat = null;
  dernierAppel = null;
});

// --- Question couverte : source renseignée, pas de proposition de signalement
test('POST /api/chat renvoie source et proposerSignalement=false pour une question couverte (req 5.1, 5.2)', async () => {
  prochainResultat = {
    reponse: 'Connectez-vous au réseau SmartCampus avec vos identifiants.',
    source: 'Connexion au Wi-Fi',
    incidentDetecte: false,
    categorie: null,
    lieu: null,
  };

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${jeton('etudiant')}`)
    .send({ question: 'Comment me connecter au Wi-Fi ?', historique: [] });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.source, 'Connexion au Wi-Fi');
  assert.strictEqual(res.body.incidentDetecte, false);
  assert.strictEqual(res.body.proposerSignalement, false);
  // La question alimente la description du pré-remplissage.
  assert.strictEqual(res.body.prefill.description, 'Comment me connecter au Wi-Fi ?');
  assert.strictEqual(res.body.prefill.categorieId, null);
  assert.strictEqual(res.body.prefill.lieuId, null);

  // La question et l'historique sont bien transmis au service.
  assert.strictEqual(dernierAppel.question, 'Comment me connecter au Wi-Fi ?');
  assert.deepStrictEqual(dernierAppel.historique, []);
});

// --- Hors périmètre : source null → proposerSignalement=true ----------------
test('POST /api/chat propose un signalement quand la réponse est hors périmètre (source null) (req 5.3)', async () => {
  prochainResultat = {
    reponse: 'Je ne sais pas',
    source: null,
    incidentDetecte: false,
    categorie: null,
    lieu: null,
  };

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${jeton('etudiant')}`)
    .send({ question: 'Combien coûte un café ?' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.source, null);
  assert.strictEqual(res.body.proposerSignalement, true);
});

// --- Incident détecté : categorie/lieu résolus en ids -----------------------
test('POST /api/chat résout categorieId/lieuId et propose un signalement quand incidentDetecte=true (req 5.3)', async () => {
  prochainResultat = {
    reponse: 'Cela ressemble à une panne de matériel.',
    source: null,
    incidentDetecte: true,
    // Casse différente des libellés du référentiel pour vérifier l'insensibilité.
    categorie: 'matériel défectueux',
    lieu: 'b204',
  };

  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${jeton('etudiant')}`)
    .send({ question: 'Le vidéoprojecteur de la B204 ne marche plus' });

  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.incidentDetecte, true);
  assert.strictEqual(res.body.proposerSignalement, true);
  assert.strictEqual(res.body.prefill.categorieId, 2, 'matériel défectueux → id 2');
  assert.strictEqual(res.body.prefill.lieuId, 3, 'B204 → id 3');
  assert.strictEqual(
    res.body.prefill.description,
    'Le vidéoprojecteur de la B204 ne marche plus'
  );
});

// --- Garde de rôle : non-etudiant → 403 -------------------------------------
test('POST /api/chat refuse un rôle non-etudiant (→ 403)', async () => {
  const res = await request(app)
    .post('/api/chat')
    .set('Authorization', `Bearer ${jeton('technicien', 2)}`)
    .send({ question: 'Une question' });

  assert.strictEqual(res.status, 403);
  assert.ok(res.body.error, 'un message d’erreur doit être renvoyé');
});
