// Page « Ma file » du technicien (US-03, exigences 4.1 et 4.6).
//
// - Protège la page (Auth.exigerConnexion) et construit la navigation du rôle.
// - Récupère la file via GET /api/technicien/tickets (déjà triée par priorité
//   puis date de création côté serveur) et l'affiche.
// - Affiche la priorité et un badge « En retard » quand en_retard est vrai
//   (exigence 4.6).
// - Pour chaque ticket :
//     · statut « Ouvert »   → bouton « Prendre en charge » (PATCH → « En cours »)
//     · statut « En cours » → champ commentaire (obligatoire) + bouton
//                             « Résoudre » (PATCH → « Résolu » avec commentaire)
// - Les mises à jour passent par apiFetch en PATCH + corps JSON ; en cas de
//   succès la liste est rafraîchie, sinon le message d'erreur serveur est
//   affiché (ex. commentaire manquant → 400).

// Protection de la page : redirige vers la connexion si non authentifié.
const utilisateur = Auth.exigerConnexion();
if (utilisateur) {
  construireNavigation('file.html');
}

const erreur = document.getElementById('erreur');
const conteneurFile = document.getElementById('file');
const blocVide = document.getElementById('bloc-vide');

// Échappe le texte pour une insertion sûre dans le HTML.
function echapper(valeur) {
  const div = document.createElement('div');
  div.textContent = valeur == null ? '' : String(valeur);
  return div.innerHTML;
}

// Classe CSS du badge de priorité selon la valeur.
function classePriorite(priorite) {
  switch (priorite) {
    case 'Critique':
      return 'prio-critique';
    case 'Haute':
      return 'prio-haute';
    case 'Normale':
      return 'prio-normale';
    default:
      return 'prio-basse';
  }
}

// Formate la date de création de façon lisible.
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

// Change le statut d'un ticket via PATCH, puis rafraîchit la file.
async function changerStatut(ticketId, statut, commentaire) {
  erreur.textContent = '';
  const corps = { statut };
  if (commentaire != null) corps.commentaire = commentaire;

  try {
    await apiFetch(`/api/tickets/${encodeURIComponent(ticketId)}/statut`, {
      method: 'PATCH',
      body: JSON.stringify(corps),
    });
    await chargerFile();
  } catch (err) {
    erreur.textContent = err.message;
  }
}

// Construit la carte d'un ticket et branche ses actions.
function creerCarteTicket(ticket) {
  const carte = document.createElement('article');
  carte.className = 'carte ticket';

  const lieu = `${ticket.batiment} · ${ticket.salle}`;
  const badgeRetard = ticket.en_retard
    ? '<span class="badge badge-retard">En retard</span>'
    : '';

  carte.innerHTML = `
    <header class="ticket-entete">
      <span class="ticket-numero">${echapper(ticket.numero)}</span>
      <span class="badge ${classePriorite(ticket.priorite)}">${echapper(ticket.priorite)}</span>
      <span class="badge badge-statut">${echapper(ticket.statut)}</span>
      ${badgeRetard}
    </header>
    <p class="ticket-meta">${echapper(ticket.categorie)} — ${echapper(lieu)}</p>
    <p class="ticket-description">${echapper(ticket.description)}</p>
    <p class="ticket-date">Créé le ${echapper(formaterDate(ticket.cree_le))}</p>
    <div class="ticket-actions"></div>`;

  const actions = carte.querySelector('.ticket-actions');

  if (ticket.statut === 'Ouvert') {
    // Prendre en charge : Ouvert → En cours (sans commentaire).
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'bouton';
    bouton.textContent = 'Prendre en charge';
    bouton.addEventListener('click', () => {
      bouton.disabled = true;
      changerStatut(ticket.id, 'En cours');
    });
    actions.appendChild(bouton);
  } else if (ticket.statut === 'En cours') {
    // Résoudre : En cours → Résolu avec un commentaire obligatoire.
    const champ = document.createElement('div');
    champ.className = 'champ';
    champ.innerHTML = `
      <label for="commentaire-${echapper(ticket.id)}">Commentaire de résolution <span aria-hidden="true">*</span></label>
      <textarea id="commentaire-${echapper(ticket.id)}" rows="2"
        placeholder="Décrivez la résolution…" required></textarea>`;
    actions.appendChild(champ);

    const textarea = champ.querySelector('textarea');

    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'bouton';
    bouton.textContent = 'Résoudre';
    bouton.addEventListener('click', () => {
      const commentaire = textarea.value.trim();
      // Validation côté client (RG-10) ; le serveur refuse aussi un commentaire
      // vide avec un 400 explicite.
      if (!commentaire) {
        champ.classList.add('erreur');
        erreur.textContent = 'Un commentaire est obligatoire pour résoudre un ticket.';
        return;
      }
      champ.classList.remove('erreur');
      bouton.disabled = true;
      changerStatut(ticket.id, 'Résolu', commentaire);
    });
    actions.appendChild(bouton);
  }

  return carte;
}

// Charge la file et l'affiche (tri déjà appliqué côté serveur).
async function chargerFile() {
  erreur.textContent = '';
  try {
    const { tickets } = await apiFetch('/api/technicien/tickets');

    conteneurFile.innerHTML = '';

    if (!tickets || tickets.length === 0) {
      blocVide.hidden = false;
      return;
    }

    blocVide.hidden = true;
    tickets.forEach((ticket) => {
      conteneurFile.appendChild(creerCarteTicket(ticket));
    });
  } catch (err) {
    erreur.textContent = err.message;
  }
}

chargerFile();
