// Tests de bout en bout de l'assistant IA (tâche 7.4).
//
// Contrairement à tests/us04-chat.test.js — qui mocke bedrockService lui-même
// pour vérifier la LOGIQUE DE MAPPING de la route — ce fichier traverse le VRAI
// bedrockService : seul le CLIENT Bedrock du SDK AWS est simulé (comme dans
// tests/bedrockService.test.js). On vérifie ainsi bedrockService + la route
// POST /api/chat ensemble, face à une réponse de modèle réaliste.
//
// Les mocks (client Bedrock + db) sont injectés dans le cache de require AVANT
// de charger src/app : aucun appel réel à AWS ni à la base. Chaque fichier de
// test s'exécutant dans son propre process sous `node --test`, ces mocks de
// require.cache n'entrent pas en conflit avec ceux de us04-chat.test.js.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const config = require('../src/config');

// --- Mock du CLIENT du SDK Bedrock -----------------------------------------
const cheminBedrock = require.resolve('@aws-sdk/client-bedrock-runtime');

// Journal des commandes envoyées + texte brut que le modèle renverra.
const envois = [];
let prochaineReponse = null; // texte JSON (ou non) renvoyé par le « modèle »

class FauxBedrockClient {
  constructor(options) {
    this.options = options;
  }

  async send(commande) {
    envois.push(commande);
    return {
      output: { message: { content: [{ text: prochaineReponse }] } },
    };
  }
}

class ConverseCommand {
  constructor(input) {
    this.input = input;
  }
}

require.cache[cheminBedrock] = {
  id: cheminBedrock,
  filename: cheminBedrock,
  loaded: true,
  exports: { BedrockRuntimeClient: FauxBedrockClient, ConverseCommand },
};

// --- Mock du module db ------------------------------------------------------
// bedrockService lit les fiches FAQ (SELECT ... FROM faq) pour le prompt
// système ; la route lit les référentiels categorie/lieu pour résoudre les ids.
const cheminDb = require.resolve('../src/db');

const fichesFaq = [
  {
    id: 1,
    titre: 'Connexion au Wi-Fi',
    contenu: 'Connectez-vous au réseau SmartCampus avec vos identifiants.',
  },
  {
    id: 2,
    titre: 'Réserver une salle',
    contenu: 'Utilisez le portail de réservation en ligne.',
  },
];
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
      if (/FROM faq/.test(text)) {
        return { rows: fichesFaq };
      }
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

// Charger l'app APRÈS avoir injecté les mocks (client Bedrock + db).
const app = require('../src/app');

function jeton(role, id = 1) {
  return jwt.sign({ id, nom: 'Test', role }, config.jwtSecret, { expiresIn: '1h' });
}

test.beforeEach(() => {
  envois.length = 0;
  prochaineReponse = null;
});

// --- Question couverte : le modèle renvoie une source (req 5.2) -------------
test(
  'POST /api/chat (Bedrock mocké) : question couverte → source renseignée, proposerSignalement=false (req 5.2)',
  async () => {
    // Réponse réaliste du modèle : JSON avec une source non nulle.
    prochaineReponse = JSON.stringify({
      reponse: 'Connectez-vous au réseau SmartCampus avec vos identifiants.',
      source: 'Connexion au Wi-Fi',
      incidentDetecte: false,
      categorie: null,
      lieu: null,
    });

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${jeton('etudiant')}`)
      .send({ question: 'Comment me connecter au Wi-Fi ?', historique: [] });

    assert.strictEqual(res.status, 200);
    // La source renseignée est bien remontée jusqu'à la réponse HTTP.
    assert.strictEqual(res.body.source, 'Connexion au Wi-Fi');
    assert.match(res.body.reponse, /SmartCampus/);
    assert.strictEqual(res.body.incidentDetecte, false);
    // Source non nulle + pas d'incident → aucune proposition de signalement.
    assert.strictEqual(res.body.proposerSignalement, false);

    // On a bien traversé le VRAI service : un appel Converse a été émis et le
    // prompt système construit à partir des fiches FAQ contient leurs titres.
    assert.strictEqual(envois.length, 1, 'un seul appel Converse via le vrai service');
    const systemText = envois[0].input.system.map((s) => s.text).join('\n');
    assert.match(systemText, /Connexion au Wi-Fi/);
  }
);

// --- Hors périmètre : « Je ne sais pas », source null (req 5.3) -------------
test(
  'POST /api/chat (Bedrock mocké) : hors périmètre → « Je ne sais pas », source null, proposerSignalement=true (req 5.3)',
  async () => {
    // Réponse réaliste du modèle : aucune fiche ne couvre la question.
    prochaineReponse = JSON.stringify({
      reponse: 'Je ne sais pas',
      source: null,
      incidentDetecte: false,
      categorie: null,
      lieu: null,
    });

    const res = await request(app)
      .post('/api/chat')
      .set('Authorization', `Bearer ${jeton('etudiant')}`)
      .send({ question: 'Combien coûte un café au distributeur ?' });

    assert.strictEqual(res.status, 200);
    assert.match(res.body.reponse, /Je ne sais pas/);
    assert.strictEqual(res.body.source, null);
    // Source null → on propose de créer un signalement.
    assert.strictEqual(res.body.proposerSignalement, true);

    assert.strictEqual(envois.length, 1, 'un seul appel Converse via le vrai service');
  }
);
