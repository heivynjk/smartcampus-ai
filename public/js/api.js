// Client API commun à toutes les pages.
// - stocke le jeton et l'utilisateur dans sessionStorage
// - apiFetch() ajoute l'en-tête Authorization, parse le JSON,
//   redirige vers index.html sur 401, et lève l'erreur serveur sinon.

const Auth = {
  get token() {
    return sessionStorage.getItem('token');
  },
  get utilisateur() {
    const brut = sessionStorage.getItem('utilisateur');
    return brut ? JSON.parse(brut) : null;
  },
  connecter(token, utilisateur) {
    sessionStorage.setItem('token', token);
    sessionStorage.setItem('utilisateur', JSON.stringify(utilisateur));
  },
  deconnecter() {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('utilisateur');
    window.location.href = 'index.html';
  },
  // Protège une page : redirige vers la connexion si aucun jeton.
  exigerConnexion() {
    if (!this.token) {
      window.location.href = 'index.html';
      return null;
    }
    return this.utilisateur;
  },
};

// Destination après connexion selon le rôle.
function pageAccueil(role) {
  switch (role) {
    case 'etudiant':
      return 'mes-demandes.html';
    case 'technicien':
      return 'file.html';
    case 'admin':
      return 'dashboard.html';
    default:
      return 'index.html';
  }
}

async function apiFetch(url, options = {}) {
  const entetes = Object.assign({}, options.headers);

  // N'imposer le Content-Type JSON que si le corps n'est pas un FormData.
  if (options.body && !(options.body instanceof FormData) && !entetes['Content-Type']) {
    entetes['Content-Type'] = 'application/json';
  }
  if (Auth.token) {
    entetes.Authorization = `Bearer ${Auth.token}`;
  }

  const reponse = await fetch(url, Object.assign({}, options, { headers: entetes }));

  // Jeton absent, invalide ou expiré : retour à la connexion.
  if (reponse.status === 401) {
    Auth.deconnecter();
    throw new Error('Session expirée, veuillez vous reconnecter.');
  }

  let donnees = null;
  const type = reponse.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    donnees = await reponse.json();
  }

  if (!reponse.ok) {
    const message = (donnees && donnees.error) || 'Une erreur est survenue.';
    throw new Error(message);
  }

  return donnees;
}

// Construit la barre de navigation selon le rôle connecté.
// `actif` est le nom de fichier de la page courante pour le surlignage.
function construireNavigation(actif) {
  const utilisateur = Auth.utilisateur;
  if (!utilisateur) return;

  const liens = {
    etudiant: [
      { href: 'mes-demandes.html', texte: 'Mes demandes' },
      { href: 'signaler.html', texte: 'Signaler' },
      { href: 'chat.html', texte: 'Assistant' },
    ],
    technicien: [
      { href: 'file.html', texte: 'Ma file' },
    ],
    admin: [
      { href: 'dashboard.html', texte: 'Tableau de bord' },
    ],
  };

  const items = (liens[utilisateur.role] || [])
    .map((l) => {
      const classe = l.href === actif ? ' class="actif"' : '';
      return `<a href="${l.href}"${classe}>${l.texte}</a>`;
    })
    .join('');

  const html = `
    <nav class="barre-nav" aria-label="Navigation principale">
      <span class="marque">SmartCampus</span>
      <div class="liens">${items}</div>
      <div class="profil">
        <span class="notifications" title="Notifications non lues">
          <span aria-hidden="true">🔔</span>
          <span id="compteur-notifications" class="badge-notifications" hidden
                aria-live="polite" aria-label="0 notification non lue">0</span>
        </span>
        <span class="nom">${utilisateur.nom}</span>
        <button type="button" id="btn-deconnexion" class="lien-bouton">Déconnexion</button>
      </div>
    </nav>`;

  const cible = document.getElementById('navigation');
  if (cible) {
    cible.innerHTML = html;
    const btn = document.getElementById('btn-deconnexion');
    if (btn) btn.addEventListener('click', () => Auth.deconnecter());
    demarrerCompteurNotifications();
  }
}

// Compteur de notifications non lues affiché dans la barre de navigation.
// Rafraîchi toutes les 30 secondes. Résilient : toute erreur réseau est
// ignorée silencieusement (le compteur conserve sa dernière valeur connue).
let _intervalleNotifications = null;

async function rafraichirCompteurNotifications() {
  const badge = document.getElementById('compteur-notifications');
  if (!badge) return;
  try {
    const donnees = await apiFetch('/api/notifications');
    const nonLues = (donnees && donnees.nonLues) || 0;
    badge.textContent = String(nonLues);
    badge.setAttribute(
      'aria-label',
      `${nonLues} notification${nonLues > 1 ? 's' : ''} non lue${nonLues > 1 ? 's' : ''}`
    );
    badge.hidden = nonLues === 0;
  } catch (err) {
    // Silencieux : ne pas perturber la page si l'appel échoue.
  }
}

function demarrerCompteurNotifications() {
  if (_intervalleNotifications) {
    clearInterval(_intervalleNotifications);
    _intervalleNotifications = null;
  }
  rafraichirCompteurNotifications();
  _intervalleNotifications = setInterval(rafraichirCompteurNotifications, 30000);
}
