// Page « Tableau de bord » de l'admin (US-06, exigences 7.1, 7.2, 7.4, 7.6).
//
// - Protège la page (Auth.exigerConnexion) et construit la navigation du rôle
//   (page réservée à l'admin ; l'API renvoie 403 pour les autres rôles).
// - Récupère les agrégats via GET /api/stats?periode=semaine|mois|semestre.
// - Le sélecteur de période recharge les données et recalcule tous les
//   indicateurs (exigence 7.2).
// - Affiche : une tuile « total », une tuile « délai moyen de résolution »
//   (en heures), et 3 graphiques Chart.js (barres par catégorie, barres
//   horizontales top 5 lieux, anneau par statut), conformément à design.md.
// - Si la période ne contient aucun ticket (total === 0), affiche
//   « Aucun incident sur la période » et masque les indicateurs (exigence 7.4).
// - Les graphiques sont détruits puis recréés à chaque changement de période
//   pour éviter les fuites de mémoire / rendus superposés.
//
// Le tableau de bord n'affiche que des données agrégées, sans nom d'étudiant
// (exigence 7.6) : le service ne renvoie que des agrégats.

// Protection de la page : redirige vers la connexion si non authentifié.
const utilisateur = Auth.exigerConnexion();
if (utilisateur) {
  construireNavigation('dashboard.html');
}

const erreur = document.getElementById('erreur');
const selecteurPeriode = document.getElementById('periode');
const blocVide = document.getElementById('bloc-vide');
const indicateurs = document.getElementById('indicateurs');
const valeurTotal = document.getElementById('valeur-total');
const valeurDelai = document.getElementById('valeur-delai');

// Palette de couleurs réutilisée par les graphiques.
const COULEURS = [
  '#1d4ed8', '#16a34a', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#4f46e5', '#ca8a04',
];

// Couleurs fixes par statut (cohérentes avec les badges du reste de l'app).
const COULEUR_STATUT = {
  Ouvert: '#d97706',
  'En cours': '#1d4ed8',
  Résolu: '#16a34a',
};

// Références aux instances Chart.js en cours, pour les détruire au rechargement.
const graphiques = {
  categorie: null,
  lieu: null,
  statut: null,
};

// Échappe le texte pour une insertion sûre dans le HTML.
function echapper(valeur) {
  const div = document.createElement('div');
  div.textContent = valeur == null ? '' : String(valeur);
  return div.innerHTML;
}

// Détruit toutes les instances Chart.js existantes (évite les fuites).
function detruireGraphiques() {
  Object.keys(graphiques).forEach((cle) => {
    if (graphiques[cle]) {
      graphiques[cle].destroy();
      graphiques[cle] = null;
    }
  });
}

// Construit les 3 graphiques à partir des agrégats renvoyés par l'API.
function dessinerGraphiques(stats) {
  detruireGraphiques();

  const optionsCommunes = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
  };

  // 1) Barres verticales : tickets par catégorie.
  const ctxCategorie = document.getElementById('graph-categorie');
  graphiques.categorie = new Chart(ctxCategorie, {
    type: 'bar',
    data: {
      labels: stats.parCategorie.map((c) => c.categorie),
      datasets: [
        {
          label: 'Tickets',
          data: stats.parCategorie.map((c) => c.total),
          backgroundColor: stats.parCategorie.map((_, i) => COULEURS[i % COULEURS.length]),
        },
      ],
    },
    options: Object.assign({}, optionsCommunes, {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    }),
  });

  // 2) Barres horizontales : top 5 des lieux.
  const ctxLieu = document.getElementById('graph-lieu');
  graphiques.lieu = new Chart(ctxLieu, {
    type: 'bar',
    data: {
      labels: stats.parLieu.map((l) => `${l.batiment} · ${l.salle}`),
      datasets: [
        {
          label: 'Tickets',
          data: stats.parLieu.map((l) => l.total),
          backgroundColor: stats.parLieu.map((_, i) => COULEURS[i % COULEURS.length]),
        },
      ],
    },
    options: Object.assign({}, optionsCommunes, {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    }),
  });

  // 3) Anneau : répartition par statut.
  const ctxStatut = document.getElementById('graph-statut');
  graphiques.statut = new Chart(ctxStatut, {
    type: 'doughnut',
    data: {
      labels: stats.parStatut.map((s) => s.statut),
      datasets: [
        {
          data: stats.parStatut.map((s) => s.total),
          backgroundColor: stats.parStatut.map(
            (s, i) => COULEUR_STATUT[s.statut] || COULEURS[i % COULEURS.length]
          ),
        },
      ],
    },
    options: Object.assign({}, optionsCommunes, {
      plugins: { legend: { position: 'bottom' } },
    }),
  });
}

// Met à jour les tuiles d'indicateurs (total, délai moyen).
function majTuiles(stats) {
  valeurTotal.textContent = echapper(String(stats.total));
  valeurDelai.textContent =
    stats.delaiMoyenHeures == null ? '—' : echapper(String(stats.delaiMoyenHeures));
}

// Charge les statistiques pour la période choisie et met à jour la page.
async function chargerStats() {
  erreur.textContent = '';
  const periode = selecteurPeriode.value;

  try {
    const stats = await apiFetch(`/api/stats?periode=${encodeURIComponent(periode)}`);

    // Période sans aucun ticket : message dédié, indicateurs masqués (exigence 7.4).
    if (!stats || stats.total === 0) {
      detruireGraphiques();
      indicateurs.hidden = true;
      blocVide.hidden = false;
      return;
    }

    blocVide.hidden = true;
    indicateurs.hidden = false;
    majTuiles(stats);
    dessinerGraphiques(stats);
  } catch (err) {
    erreur.textContent = err.message;
  }
}

// Recalcul de tous les indicateurs au changement de période (exigence 7.2).
selecteurPeriode.addEventListener('change', chargerStats);

chargerStats();
