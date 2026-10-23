// Assistant IA : interroge Amazon Bedrock (Nova Lite) via l'API Converse.
//
// Aucune clé AWS dans le code : le BedrockRuntimeClient utilise les droits du
// rôle IAM de l'EC2 (RG 9.4) ; seule la région vient de la configuration.
//
// Confidentialité (exigence 5.5) : on n'envoie au modèle QUE la question et
// l'historique de la conversation en session — JAMAIS le nom ni l'e-mail de
// l'utilisateur. Le prompt système est reconstruit à chaque appel à partir des
// fiches de la table `faq` afin de refléter le contenu courant (exigence 5.1).
//
// Réponse : le modèle doit renvoyer un objet JSON ; on extrait le premier
// objet `{...}` du texte et on le parse dans un try/catch. En cas d'échec, on
// renvoie un repli lisible (exigence 5.3). Toute réponse est en français
// (exigence 5.4). Si Bedrock est indisponible, on lève une erreur métier 503
// (exigence 5.7).
const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require('@aws-sdk/client-bedrock-runtime');

const config = require('../config');
const db = require('../db');

// Client Bedrock : région depuis la config, aucune credential en dur (rôle IAM).
const client = new BedrockRuntimeClient({ region: config.awsRegion });

// En-tête du prompt système, repris mot pour mot de design.md (« Assistant IA »).
const ENTETE_PROMPT = [
  "Tu es l'assistant du campus SmartCampus. Réponds en français, en 3 phrases maximum, uniquement à partir des fiches FAQ ci-dessous.",
  'Si aucune fiche ne permet de répondre, dis "Je ne sais pas" et propose de créer un signalement.',
  "Si l'utilisateur décrit un problème matériel, une salle fermée, un problème réseau ou de sécurité, considère que c'est un incident.",
  'Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour :',
  '{"reponse": "...", "source": "<titre de la fiche ou null>", "incidentDetecte": true|false,',
  ' "categorie": "<Salle fermée|Matériel défectueux|Problème réseau|Sécurité|Autre|null>", "lieu": "<salle citée ou null>"}',
].join('\n');

/**
 * Récupère les fiches FAQ (requête paramétrée/simple, RG 9.3) et construit la
 * liste numérotée attendue dans le prompt : `[n] <titre> : <contenu>`.
 * @returns {Promise<string>} le texte complet du prompt système.
 */
async function construirePromptSysteme() {
  const { rows } = await db.query('SELECT id, titre, contenu FROM faq ORDER BY id');
  const fiches = rows
    .map((f, i) => `[${i + 1}] ${f.titre} : ${f.contenu}`)
    .join('\n');
  return `${ENTETE_PROMPT}\n\nFICHES FAQ :\n${fiches}`;
}

/**
 * Convertit l'historique de session (`[{ role, texte }]`) en messages Converse.
 * Seuls les rôles `user` et `assistant` sont transmis ; aucune donnée
 * personnelle (nom, e-mail) n'est incluse (exigence 5.5). Les entrées vides ou
 * de rôle inconnu sont ignorées.
 * @param {Array<{ role?: string, texte?: string }>} historique
 * @returns {Array<{ role: string, content: Array<{ text: string }> }>}
 */
function mapperHistorique(historique) {
  if (!Array.isArray(historique)) {
    return [];
  }
  return historique
    .filter((m) => m && typeof m.texte === 'string' && m.texte.length > 0)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: [{ text: m.texte }],
    }));
}

/**
 * Extrait le texte renvoyé par le modèle depuis la réponse Converse.
 * @param {object} reponse  Sortie de `ConverseCommand`.
 * @returns {string} le texte concaténé des blocs de la réponse.
 */
function extraireTexte(reponse) {
  const blocs = reponse
    && reponse.output
    && reponse.output.message
    && reponse.output.message.content;
  if (!Array.isArray(blocs)) {
    return '';
  }
  return blocs
    .map((b) => (b && typeof b.text === 'string' ? b.text : ''))
    .join('')
    .trim();
}

/**
 * Analyse le texte du modèle : extrait le premier objet `{...}` et le parse.
 * En cas d'échec (pas de JSON ou JSON invalide), renvoie un repli lisible
 * `{ reponse: <texte brut>, source: null, incidentDetecte: false }` (design.md).
 * @param {string} texte
 * @returns {{ reponse: string, source: ?string, incidentDetecte: boolean,
 *             categorie?: ?string, lieu?: ?string }}
 */
function analyserReponse(texte) {
  const brut = typeof texte === 'string' ? texte : '';
  const debut = brut.indexOf('{');
  const fin = brut.lastIndexOf('}');
  if (debut !== -1 && fin !== -1 && fin > debut) {
    const candidat = brut.slice(debut, fin + 1);
    try {
      const obj = JSON.parse(candidat);
      return {
        reponse: typeof obj.reponse === 'string' ? obj.reponse : brut,
        source: obj.source != null && obj.source !== '' ? obj.source : null,
        incidentDetecte: obj.incidentDetecte === true,
        categorie: obj.categorie != null && obj.categorie !== '' ? obj.categorie : null,
        lieu: obj.lieu != null && obj.lieu !== '' ? obj.lieu : null,
      };
    } catch (_err) {
      // JSON invalide : on bascule sur le repli ci-dessous.
    }
  }
  // Repli : réponse non structurée, affichée telle quelle à l'utilisateur.
  return { reponse: brut, source: null, incidentDetecte: false };
}

/**
 * Interroge l'assistant IA.
 *
 * @param {object} args
 * @param {string} args.question    La nouvelle question de l'utilisateur.
 * @param {Array<{ role?: string, texte?: string }>} [args.historique]
 *        Historique de la conversation en session (sans donnée personnelle).
 * @returns {Promise<{ reponse: string, source: ?string, incidentDetecte: boolean,
 *                     categorie: ?string, lieu: ?string }>}
 * @throws {{ status: 503, message: string }} si Bedrock est indisponible.
 */
async function interroger({ question, historique = [] }) {
  const promptSysteme = await construirePromptSysteme();

  const messages = [
    ...mapperHistorique(historique),
    { role: 'user', content: [{ text: String(question || '') }] },
  ];

  let reponse;
  try {
    reponse = await client.send(
      new ConverseCommand({
        modelId: config.bedrockModelId,
        system: [{ text: promptSysteme }],
        messages,
        inferenceConfig: { maxTokens: 500, temperature: 0.2 },
      })
    );
  } catch (_err) {
    // Bedrock inaccessible / erreur d'appel → erreur métier 503 (exigence 5.7).
    throw { status: 503, message: "L'assistant est momentanément indisponible." };
  }

  return analyserReponse(extraireTexte(reponse));
}

module.exports = {
  interroger,
  // Exposés pour les tests et une éventuelle réutilisation.
  construirePromptSysteme,
  mapperHistorique,
  analyserReponse,
  extraireTexte,
};
