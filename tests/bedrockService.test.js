// Tests unitaires de l'assistant IA (tâche 7.1).
// Le client Bedrock et le module db sont mockés : aucun appel réel à AWS ni à
// la base (voir design.md « les tests mockent le client Bedrock »).
const test = require('node:test');
const assert = require('node:assert');

// --- Mock du SDK Bedrock ----------------------------------------------------
const cheminBedrock = require.resolve('@aws-sdk/client-bedrock-runtime');

// Journal des commandes envoyées au client simulé + réponse/erreur à renvoyer.
const envois = [];
let prochaineReponse = null; // texte que le modèle renverra
let prochaineErreur = null; // si défini, le client lève cette erreur

class FauxBedrockClient {
  constructor(options) {
    this.options = options;
  }

  async send(commande) {
    envois.push(commande);
    if (prochaineErreur) {
      throw prochaineErreur;
    }
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
const cheminDb = require.resolve('../src/db');

// Fiches FAQ de démo renvoyées par le SELECT.
const fichesFaq = [
  { id: 1, titre: 'Connexion au Wi-Fi', contenu: 'Connectez-vous au réseau SmartCampus avec vos identifiants.' },
  { id: 2, titre: 'Réserver une salle', contenu: 'Utilisez le portail de réservation en ligne.' },
];

require.cache[cheminDb] = {
  id: cheminDb,
  filename: cheminDb,
  loaded: true,
  exports: {
    pool: {},
    query: async (text, _params) => {
      if (/FROM faq/.test(text)) {
        return { rows: fichesFaq };
      }
      return { rows: [] };
    },
  },
};

// Charger le service APRÈS avoir injecté les mocks.
delete require.cache[require.resolve('../src/services/bedrockService')];
const bedrockService = require('../src/services/bedrockService');

test.beforeEach(() => {
  envois.length = 0;
  prochaineReponse = null;
  prochaineErreur = null;
});

// --- Question couverte : JSON parsé avec une source -------------------------
test('interroger renvoie l\'objet parsé avec une source pour une question couverte', async () => {
  prochaineReponse = JSON.stringify({
    reponse: 'Connectez-vous au réseau SmartCampus avec vos identifiants.',
    source: 'Connexion au Wi-Fi',
    incidentDetecte: false,
    categorie: null,
    lieu: null,
  });

  const res = await bedrockService.interroger({
    question: 'Comment me connecter au Wi-Fi ?',
    historique: [],
  });

  assert.strictEqual(res.source, 'Connexion au Wi-Fi');
  assert.strictEqual(res.incidentDetecte, false);
  assert.match(res.reponse, /SmartCampus/);
});

// --- Réponse non-JSON : repli gracieux --------------------------------------
test('interroger bascule sur un repli lisible si la réponse n\'est pas un JSON', async () => {
  prochaineReponse = "Je ne comprends pas très bien la question.";

  const res = await bedrockService.interroger({ question: 'Bonjour ?' });

  assert.strictEqual(res.reponse, 'Je ne comprends pas très bien la question.');
  assert.strictEqual(res.source, null);
  assert.strictEqual(res.incidentDetecte, false);
});

// --- Panne Bedrock → erreur métier 503 --------------------------------------
test('interroger lève une erreur 503 française si Bedrock est indisponible', async () => {
  prochaineErreur = new Error('ServiceUnavailable');

  await assert.rejects(
    () => bedrockService.interroger({ question: 'Une question' }),
    (err) =>
      err.status === 503 &&
      err.message === "L'assistant est momentanément indisponible."
  );
});

// --- Prompt système : contient les titres de fiches, mais aucune donnée perso
test('le prompt système liste les fiches FAQ et n\'envoie ni nom ni e-mail (exigence 5.5)', async () => {
  prochaineReponse = '{"reponse":"ok","source":null,"incidentDetecte":false}';

  await bedrockService.interroger({
    question: 'Comment réserver une salle ?',
    historique: [
      { role: 'user', texte: 'Bonjour' },
      { role: 'assistant', texte: 'Bonjour, comment puis-je aider ?' },
    ],
  });

  assert.strictEqual(envois.length, 1, 'un seul appel Converse');
  const input = envois[0].input;

  // Le prompt système liste bien les titres des fiches FAQ.
  const systemText = input.system.map((s) => s.text).join('\n');
  assert.match(systemText, /Connexion au Wi-Fi/);
  assert.match(systemText, /Réserver une salle/);
  assert.match(systemText, /\[1\] Connexion au Wi-Fi/);

  // Configuration d'inférence conforme à design.md.
  assert.strictEqual(input.inferenceConfig.maxTokens, 500);
  assert.strictEqual(input.inferenceConfig.temperature, 0.2);

  // L'historique et la question sont transmis sous forme de messages user/assistant.
  assert.strictEqual(input.messages.length, 3);
  assert.strictEqual(input.messages[input.messages.length - 1].role, 'user');
  assert.match(input.messages[input.messages.length - 1].content[0].text, /réserver une salle/);

  // Aucune donnée personnelle (nom/e-mail) ne doit figurer dans la requête.
  const charge = JSON.stringify(input);
  assert.ok(!/@/.test(charge), 'aucune adresse e-mail transmise');
  assert.ok(!/nom|email|e-mail/i.test(charge), 'aucun champ nom/e-mail transmis');
});

// --- Extraction du premier objet JSON noyé dans du texte --------------------
test('analyserReponse extrait le premier objet JSON même entouré de texte', () => {
  const texte = 'Voici ma réponse : {"reponse":"Salut","source":null,"incidentDetecte":true} merci.';
  const res = bedrockService.analyserReponse(texte);
  assert.strictEqual(res.reponse, 'Salut');
  assert.strictEqual(res.incidentDetecte, true);
});
