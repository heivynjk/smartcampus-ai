// Page de connexion : soumet { email, motDePasse } à /api/auth/login,
// stocke le jeton et redirige selon le rôle.

// Déjà connecté ? on va directement à la page d'accueil du rôle.
if (Auth.token && Auth.utilisateur) {
  window.location.href = pageAccueil(Auth.utilisateur.role);
}

const form = document.getElementById('form-connexion');
const erreur = document.getElementById('erreur');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  erreur.textContent = '';

  const email = document.getElementById('email').value.trim();
  const motDePasse = document.getElementById('motDePasse').value;

  if (!email || !motDePasse) {
    erreur.textContent = 'Veuillez saisir votre e-mail et votre mot de passe.';
    return;
  }

  const bouton = form.querySelector('button[type="submit"]');
  bouton.disabled = true;

  try {
    const { token, utilisateur } = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, motDePasse }),
    });
    Auth.connecter(token, utilisateur);
    window.location.href = pageAccueil(utilisateur.role);
  } catch (err) {
    erreur.textContent = err.message;
    bouton.disabled = false;
  }
});
