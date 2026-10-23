// Page « Assistant IA » de l'étudiant (US-04, exigences 5.2 et 5.6).
//
// - Protège la page (Auth.exigerConnexion) et construit la navigation du rôle.
// - Affiche la conversation sous forme de bulles : messages de l'utilisateur et
//   de l'assistant visuellement distincts.
// - Garde l'historique de session dans un tableau côté navigateur UNIQUEMENT
//   (non persisté en base, exigence 5.6) ; la conversation reste affichée tant
//   que la session est ouverte. L'historique accumulé (tableau de
//   { role, texte }) est envoyé avec chaque nouvelle question à POST /api/chat.
// - Affiche le titre de la fiche source quand la réponse contient un `source`
//   non nul (exigence 5.2), sous la bulle de l'assistant.
// - Affiche un indicateur de chargement pendant l'attente de la réponse et
//   désactive le bouton d'envoi.
// - En cas d'erreur (ex. 503 assistant indisponible), affiche le message
//   d'erreur du serveur et un lien vers le formulaire de signalement
//   (exigence 5.7).
//
// Le contenu dynamique (question de l'utilisateur ou réponse de l'assistant)
// est échappé avant insertion dans le DOM pour éviter toute injection (XSS).
//
// Bouton « Créer un signalement » (US-05, exigences 6.1 à 6.4) :
// - Quand la réponse de POST /api/chat a `proposerSignalement === true`
//   (l'assistant a détecté un incident ou n'a pas de réponse, exigence 6.1),
//   on affiche sous la bulle de l'assistant un bouton « Créer un signalement ».
// - Ce bouton est un lien vers `signaler.html` pré-rempli à partir de
//   `prefill` : `description` (toujours), `categorieId` et `lieuId` UNIQUEMENT
//   s'ils ont pu être déduits (non nuls), plus `origine=assistant`
//   (exigences 6.2 et 6.3). Les champs non déduits restent vides et
//   obligatoires sur le formulaire.
// - Aucun ticket n'est créé ici : le flux se contente de pré-remplir le
//   formulaire. La création n'a lieu que lorsque l'étudiante valide
//   explicitement le formulaire de signalement (exigence 6.4, RG-13), qui
//   envoie alors `origine=assistant` et affiche le numéro du ticket au retour.
//
// Toutes les valeurs dynamiques insérées dans l'URL sont encodées
// (encodeURIComponent) pour éviter toute injection.

// Protection de la page : redirige vers la connexion si non authentifié.
const utilisateur = Auth.exigerConnexion();
if (utilisateur) {
  construireNavigation('chat.html');
}

const form = document.getElementById('form-chat');
const champQuestion = document.getElementById('question');
const boutonEnvoyer = document.getElementById('btn-envoyer');
const conversation = document.getElementById('conversation');
const conversationVide = document.getElementById('conversation-vide');
const chargement = document.getElementById('chargement');
const erreur = document.getElementById('erreur');

// Historique de session (exigence 5.6) : vit uniquement en mémoire du
// navigateur, jamais stocké en base. Tableau de { role, texte }.
const historique = [];

// Échappe le texte pour une insertion sûre dans le HTML (anti-XSS).
function echapper(valeur) {
  const div = document.createElement('div');
  div.textContent = valeur == null ? '' : String(valeur);
  return div.innerHTML;
}

// Ajoute une bulle au fil de la conversation.
// - role : 'user' ou 'assistant' (classe CSS distincte)
// - texte : contenu du message (échappé)
// - source : titre de la fiche FAQ (facultatif, assistant uniquement)
function ajouterBulle(role, texte, source) {
  if (conversationVide) conversationVide.hidden = true;

  const bulle = document.createElement('div');
  bulle.className = `bulle bulle-${role === 'user' ? 'user' : 'assistant'}`;

  let html = `<p class="bulle-texte">${echapper(texte)}</p>`;
  // Fiche source affichée sous la bulle de l'assistant (exigence 5.2).
  if (source) {
    html += `<p class="bulle-source">Source : ${echapper(source)}</p>`;
  }
  bulle.innerHTML = html;

  conversation.appendChild(bulle);
  // Garde la dernière bulle visible.
  conversation.scrollTop = conversation.scrollHeight;
  return bulle;
}

// Construit l'URL `signaler.html?…` à partir du prefill de l'assistant
// (exigences 6.2 et 6.3). On ajoute toujours `description` et
// `origine=assistant` ; `categorieId` / `lieuId` seulement s'ils ont été
// déduits (non nuls), sinon on les omet pour que les champs restent vides et
// obligatoires sur le formulaire. Les valeurs sont encodées (anti-injection).
function construireUrlSignalement(prefill) {
  const p = prefill || {};
  const params = new URLSearchParams();

  // Description : la question de l'étudiante (pré-remplissage raisonnable).
  if (p.description != null && String(p.description) !== '') {
    params.set('description', String(p.description));
  }

  // Catégorie et lieu : uniquement si déduits (non nuls / non vides).
  if (p.categorieId != null && String(p.categorieId) !== '') {
    params.set('categorieId', String(p.categorieId));
  }
  if (p.lieuId != null && String(p.lieuId) !== '') {
    params.set('lieuId', String(p.lieuId));
  }

  // Marque l'origine : le ticket créé portera origine='assistant' (exigence 6.4).
  params.set('origine', 'assistant');

  // URLSearchParams encode chaque valeur (équivaut à encodeURIComponent).
  return `signaler.html?${params.toString()}`;
}

// Attache un bouton « Créer un signalement » sous la bulle de l'assistant
// (exigence 6.1). Le bouton est un lien vers le formulaire pré-rempli ; aucun
// ticket n'est créé tant que l'étudiante ne valide pas (exigence 6.4).
function ajouterActionSignalement(bulle, prefill) {
  const action = document.createElement('div');
  action.className = 'bulle-action';

  const lien = document.createElement('a');
  lien.className = 'bouton bouton-compact';
  lien.href = construireUrlSignalement(prefill);
  lien.textContent = 'Créer un signalement';

  action.appendChild(lien);
  bulle.appendChild(action);
  conversation.scrollTop = conversation.scrollHeight;
}

// Affiche un message d'erreur accompagné d'un lien vers le signalement
// (exigence 5.7 : assistant indisponible → lien vers le formulaire).
function afficherErreur(message) {
  erreur.textContent = '';
  const texte = document.createElement('span');
  texte.textContent = `${message} `;
  const lien = document.createElement('a');
  lien.href = 'signaler.html';
  lien.textContent = 'Signaler un incident';
  erreur.appendChild(texte);
  erreur.appendChild(lien);
}

// Active / désactive l'état « chargement » (indicateur + bouton désactivé).
function definirChargement(actif) {
  chargement.hidden = !actif;
  boutonEnvoyer.disabled = actif;
  champQuestion.disabled = actif;
  if (actif) {
    conversation.scrollTop = conversation.scrollHeight;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  erreur.textContent = '';

  const question = champQuestion.value.trim();
  if (!question) {
    champQuestion.focus();
    return;
  }

  // Affiche immédiatement la question de l'utilisateur et vide la saisie.
  ajouterBulle('user', question);
  champQuestion.value = '';

  definirChargement(true);

  try {
    const donnees = await apiFetch('/api/chat', {
      method: 'POST',
      // On envoie l'historique accumulé AVANT cette question (exigence 5.6).
      body: JSON.stringify({ question, historique }),
    });

    const reponse = (donnees && donnees.reponse) || '';
    const source = (donnees && donnees.source) || null;

    const bulle = ajouterBulle('assistant', reponse, source);

    // Exigence 6.1 : si l'assistant a détecté un incident ou n'a pas de réponse
    // (proposerSignalement === true), on propose de créer un signalement
    // pré-rempli (exigences 6.2 / 6.3). La création reste à la main de
    // l'étudiante (exigence 6.4).
    if (donnees && donnees.proposerSignalement === true) {
      ajouterActionSignalement(bulle, donnees.prefill);
    }

    // Après une réponse réussie, on ajoute les deux tours à l'historique de
    // session (non persisté en base) pour le contexte des questions suivantes.
    historique.push({ role: 'user', texte: question });
    historique.push({ role: 'assistant', texte: reponse });
  } catch (err) {
    // Erreur serveur (ex. 503 assistant indisponible) : message + lien.
    afficherErreur(err.message);
  } finally {
    definirChargement(false);
    champQuestion.focus();
  }
});
