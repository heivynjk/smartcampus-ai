// Page « Mes demandes » de l'étudiant (US-02, exigence 3.1).
//
// - Protège la page (Auth.exigerConnexion) et construit la navigation du rôle.
// - Récupère la liste via GET /api/tickets/mes-tickets (déjà triée du plus
//   récent au plus ancien côté serveur).
// - Affiche pour chaque demande : numero, categorie, lieu (batiment · salle),
//   statut (badge coloré) et date de dernière mise à jour (maj_le).
// - Chaque élément est un lien vers ticket.html?id=<id>.
// - Affiche un message d'état vide quand il n'y a aucune demande, avec un
//   lien vers signaler.html.
//
// Le contenu dynamique (fourni par l'utilisateur ou la base) est échappé avant
// insertion dans le DOM pour éviter toute injection (XSS).

// Protection de la page : redirige vers la connexion si non authentifié.
const utilisateur = Auth.exigerConnexion();
if (utilisateur) {
  construireNavigation('mes-demandes.html');
}

const erreur = document.getElementById('erreur');
const liste = document.getElementById('liste-demandes');
const blocVide = document.getElementById('bloc-vide');

// Échappe le texte pour une insertion sûre dans le HTML.
function echapper(valeur) {
  const div = document.createElement('div');
  div.textContent = valeur == null ? '' : String(valeur);
  return div.innerHTML;
}

// Classe CSS du badge de statut selon la valeur.
function classeStatut(statut) {
  switch (statut) {
    case 'Ouvert':
      return 'statut-ouvert';
    case 'En cours':
      return 'statut-en-cours';
    case 'Résolu':
      return 'statut-resolu';
    default:
      return 'badge-statut';
  }
}

// Formate une date de façon lisible (jour, mois, année, heure, minute).
function formaterDate(valeur) {
  if (!valeur) return '';
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Construit l'élément (lien) d'une demande.
function creerElementDemande(ticket) {
  const lien = document.createElement('a');
  lien.className = 'carte ticket carte-lien';
  lien.href = `ticket.html?id=${encodeURIComponent(ticket.id)}`;

  const lieu = `${ticket.batiment} · ${ticket.salle}`;

  lien.innerHTML = `
    <header class="ticket-entete">
      <span class="ticket-numero">${echapper(ticket.numero)}</span>
      <span class="badge ${classeStatut(ticket.statut)}">${echapper(ticket.statut)}</span>
    </header>
    <p class="ticket-meta">${echapper(ticket.categorie)} — ${echapper(lieu)}</p>
    <p class="ticket-date">Mise à jour le ${echapper(formaterDate(ticket.maj_le))}</p>`;

  return lien;
}

// Charge les demandes et les affiche.
async function chargerDemandes() {
  erreur.textContent = '';
  try {
    const { tickets } = await apiFetch('/api/tickets/mes-tickets');

    liste.innerHTML = '';

    if (!tickets || tickets.length === 0) {
      blocVide.hidden = false;
      return;
    }

    blocVide.hidden = true;
    tickets.forEach((ticket) => {
      liste.appendChild(creerElementDemande(ticket));
    });
  } catch (err) {
    erreur.textContent = err.message;
  }
}

chargerDemandes();
