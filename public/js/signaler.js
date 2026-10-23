// Page « Signaler un incident » (US-01, exigences 2.2 et 2.7).
//
// - Protège la page (Auth.exigerConnexion) et construit la navigation du rôle.
// - Remplit les listes catégorie et lieu depuis GET /api/referentiels.
// - Valide côté client les champs obligatoires (catégorie, lieu, description) ;
//   un champ manquant est marqué en rouge via la classe `.champ.erreur` (RG-01).
// - Envoie le formulaire en multipart (FormData) à POST /api/tickets ; api.js ne
//   force pas le Content-Type pour un FormData, le navigateur gère la limite.
// - En cas de succès, affiche un écran de confirmation avec le numéro du ticket
//   et un lien vers son détail (ticket.html?id=…) (exigence 2.7).
// - Lit les paramètres d'URL ?description=&categorieId=&lieuId= pour le
//   pré-remplissage (US-05, voir design.md).

// Protection de la page : redirige vers la connexion si non authentifié.
const utilisateur = Auth.exigerConnexion();
if (utilisateur) {
  construireNavigation('signaler.html');
}

const form = document.getElementById('form-signaler');
const erreur = document.getElementById('erreur');

const selectCategorie = document.getElementById('categorieId');
const selectLieu = document.getElementById('lieuId');
const champDescription = document.getElementById('description');

const champs = {
  categorieId: document.getElementById('champ-categorie'),
  lieuId: document.getElementById('champ-lieu'),
  description: document.getElementById('champ-description'),
};

const blocFormulaire = document.getElementById('bloc-formulaire');
const blocConfirmation = document.getElementById('bloc-confirmation');

// Paramètres d'URL pour le pré-remplissage (US-05).
const params = new URLSearchParams(window.location.search);

// Efface le marquage d'erreur de tous les champs.
function reinitialiserErreurs() {
  erreur.textContent = '';
  Object.values(champs).forEach((c) => c.classList.remove('erreur'));
}

// Marque un champ en rouge (RG-01).
function marquerErreur(nom) {
  if (champs[nom]) champs[nom].classList.add('erreur');
}

// Charge les référentiels et pré-remplit le formulaire depuis l'URL.
async function initialiser() {
  try {
    const { categories, lieux } = await apiFetch('/api/referentiels');

    categories.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.libelle;
      selectCategorie.appendChild(opt);
    });

    lieux.forEach((l) => {
      const opt = document.createElement('option');
      opt.value = l.id;
      opt.textContent = `${l.batiment} · ${l.salle}`;
      selectLieu.appendChild(opt);
    });

    // Pré-remplissage éventuel (US-05). Les valeurs invalides sont ignorées :
    // un <select> n'accepte que des options existantes.
    const descriptionUrl = params.get('description');
    if (descriptionUrl) champDescription.value = descriptionUrl;

    const categorieUrl = params.get('categorieId');
    if (categorieUrl) selectCategorie.value = categorieUrl;

    const lieuUrl = params.get('lieuId');
    if (lieuUrl) selectLieu.value = lieuUrl;
  } catch (err) {
    erreur.textContent = err.message;
  }
}

// Affiche l'écran de confirmation avec le numéro et le lien vers le détail.
function afficherConfirmation(ticket) {
  document.getElementById('confirmation-numero').textContent = ticket.numero;
  const lien = document.getElementById('confirmation-lien');
  lien.href = `ticket.html?id=${encodeURIComponent(ticket.id)}`;

  blocFormulaire.hidden = true;
  blocConfirmation.hidden = false;
  blocConfirmation.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  reinitialiserErreurs();

  const categorieId = selectCategorie.value;
  const lieuId = selectLieu.value;
  const description = champDescription.value.trim();

  // Validation côté client (RG-01) : marquer les champs manquants en rouge.
  let manquant = false;
  if (!categorieId) { marquerErreur('categorieId'); manquant = true; }
  if (!lieuId) { marquerErreur('lieuId'); manquant = true; }
  if (!description) { marquerErreur('description'); manquant = true; }

  if (manquant) {
    erreur.textContent = 'La catégorie, le lieu et la description sont obligatoires.';
    return;
  }

  const donnees = new FormData();
  donnees.append('categorieId', categorieId);
  donnees.append('lieuId', lieuId);
  donnees.append('description', description);

  // Origine : 'assistant' si on arrive depuis le chat (US-05), sinon formulaire.
  const origine = params.get('origine');
  if (origine === 'assistant') donnees.append('origine', 'assistant');

  const fichier = document.getElementById('photo').files[0];
  if (fichier) donnees.append('photo', fichier);

  const bouton = form.querySelector('button[type="submit"]');
  bouton.disabled = true;

  try {
    // Ne pas fixer Content-Type : api.js laisse le navigateur gérer le FormData.
    const ticket = await apiFetch('/api/tickets', { method: 'POST', body: donnees });
    afficherConfirmation(ticket);
  } catch (err) {
    erreur.textContent = err.message;
    bouton.disabled = false;
  }
});

initialiser();
