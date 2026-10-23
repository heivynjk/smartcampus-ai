// Page « Détail d'une demande » (US-02, exigence 3.2).
//
// - Protège la page (Auth.exigerConnexion) et construit la navigation du rôle.
// - Lit l'identifiant du ticket dans l'URL (?id=…).
// - Récupère le détail via GET /api/tickets/:id.
// - Affiche : numero, categorie, lieu, statut, priorite, description, dates de
//   création et de mise à jour, la photo (via photoUrl, uniquement si présente)
//   et l'historique[] sous forme de chronologie lisible sur mobile (acteur,
//   ancien → nouveau statut, commentaire, date).
// - Gère proprement les erreurs 403/404 en affichant le message du serveur.
//
// Le contenu dynamique est échappé avant insertion dans le DOM (anti-XSS) ;
// la photo n'est insérée que si photoUrl est fournie.

// Protection de la page : redirige vers la connexion si non authentifié.
const utilisateur = Auth.exigerConnexion();
if (utilisateur) {
  construireNavigation('ticket.html');
}

const erreur = document.getElementById('erreur');
const detail = document.getElementById('detail');

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

// Construit le fragment HTML d'une ligne d'historique.
// La transition de statut n'est affichée que si un nouveau statut existe ;
// ancien_statut peut être NULL (création) → on affiche seulement « → Ouvert ».
function ligneHistorique(entree) {
  const transition = entree.ancien_statut
    ? `${echapper(entree.ancien_statut)} → ${echapper(entree.nouveau_statut)}`
    : echapper(entree.nouveau_statut);

  const commentaire = entree.commentaire
    ? `<p class="chrono-commentaire">${echapper(entree.commentaire)}</p>`
    : '';

  return `
    <li class="chrono-item">
      <div class="chrono-puce" aria-hidden="true"></div>
      <div class="chrono-contenu">
        <p class="chrono-entete">
          <span class="chrono-acteur">${echapper(entree.acteur)}</span>
          <span class="chrono-date">${echapper(formaterDate(entree.date))}</span>
        </p>
        <p class="chrono-transition">
          <span class="badge ${classeStatut(entree.nouveau_statut)}">${transition}</span>
        </p>
        ${commentaire}
      </div>
    </li>`;
}

// Affiche le détail complet du ticket.
function afficherDetail(ticket) {
  const lieu = `${ticket.batiment} · ${ticket.salle}`;

  // Photo : insérée uniquement si une URL présignée est fournie.
  const photo = ticket.photoUrl
    ? `<figure class="ticket-photo">
         <img src="${echapper(ticket.photoUrl)}" alt="Photo jointe au signalement ${echapper(ticket.numero)}" />
       </figure>`
    : '';

  // Historique : chronologie (ordre chronologique renvoyé par le serveur).
  const historique = Array.isArray(ticket.historique) ? ticket.historique : [];
  const chrono = historique.length
    ? `<ol class="chrono">${historique.map(ligneHistorique).join('')}</ol>`
    : '<p class="ticket-meta">Aucun évènement pour le moment.</p>';

  detail.innerHTML = `
    <section class="carte">
      <header class="ticket-entete">
        <span class="ticket-numero">${echapper(ticket.numero)}</span>
        <span class="badge ${classeStatut(ticket.statut)}">${echapper(ticket.statut)}</span>
        <span class="badge ${classePriorite(ticket.priorite)}">${echapper(ticket.priorite)}</span>
      </header>

      <dl class="ticket-infos">
        <div class="info-ligne">
          <dt>Catégorie</dt>
          <dd>${echapper(ticket.categorie)}</dd>
        </div>
        <div class="info-ligne">
          <dt>Lieu</dt>
          <dd>${echapper(lieu)}</dd>
        </div>
        <div class="info-ligne">
          <dt>Signalé le</dt>
          <dd>${echapper(formaterDate(ticket.cree_le))}</dd>
        </div>
        <div class="info-ligne">
          <dt>Mis à jour le</dt>
          <dd>${echapper(formaterDate(ticket.maj_le))}</dd>
        </div>
      </dl>

      <h2>Description</h2>
      <p class="ticket-description">${echapper(ticket.description)}</p>

      ${photo}
    </section>

    <section class="carte">
      <h2>Chronologie</h2>
      ${chrono}
    </section>`;

  detail.hidden = false;
}

// Charge le ticket désigné par ?id= dans l'URL.
async function chargerTicket() {
  erreur.textContent = '';

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');

  if (!id) {
    erreur.textContent = 'Aucune demande indiquée.';
    return;
  }

  try {
    const ticket = await apiFetch(`/api/tickets/${encodeURIComponent(id)}`);
    afficherDetail(ticket);
  } catch (err) {
    // Les erreurs 403/404 (et autres) remontent avec le message serveur
    // formaté par apiFetch.
    detail.hidden = true;
    erreur.textContent = err.message;
  }
}

chargerTicket();
