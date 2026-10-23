// Service des statistiques du tableau de bord (US-06, exigences 7.1 à 7.3).
//
// `calculerStats(periode)` agrège les tickets créés sur la période demandée :
//   - parCategorie : nombre de tickets par libellé de catégorie ;
//   - parLieu       : top 5 des lieux (bâtiment/salle) par nombre de tickets ;
//   - parStatut     : nombre de tickets par statut (Ouvert / En cours / Résolu) ;
//   - delaiMoyenHeures : délai moyen de résolution (resolu_le − cree_le) en
//                        heures, calculé sur les tickets RÉSOLUS uniquement
//                        (RG-14, exigence 7.3) ; `null` si aucun résolu ;
//   - total         : nombre total de tickets sur la période.
//
// La période provient d'un paramètre de requête : elle n'est JAMAIS concaténée
// dans le SQL. Une liste blanche (whitelist) côté serveur traduit la période en
// un intervalle, passé en paramètre (`now() - $1::interval`). Toutes les
// requêtes sont donc paramétrées (RG 9.3).
//
// Périodes reconnues : 'semaine' (7 jours), 'mois' (1 mois), 'semestre'
// (6 mois). Toute valeur inconnue (ou absente) retombe sur la valeur par
// défaut 'mois'.
const db = require('../db');

// Liste blanche période → intervalle PostgreSQL. Seules ces valeurs peuvent
// être choisies ; la valeur fournie par l'utilisateur sert uniquement de clé de
// lookup (jamais injectée dans le SQL).
const INTERVALLES_PERIODE = {
  semaine: '7 days',
  mois: '1 month',
  semestre: '6 months',
};

const PERIODE_PAR_DEFAUT = 'mois';

/**
 * Traduit une période en intervalle PostgreSQL via la liste blanche.
 * Toute valeur inconnue retombe sur la période par défaut ('mois').
 *
 * @param {string} periode  'semaine' | 'mois' | 'semestre' (sinon → défaut).
 * @returns {{ periode: string, intervalle: string }}
 */
function resoudreIntervalle(periode) {
  const cle = Object.prototype.hasOwnProperty.call(INTERVALLES_PERIODE, periode)
    ? periode
    : PERIODE_PAR_DEFAUT;
  return { periode: cle, intervalle: INTERVALLES_PERIODE[cle] };
}

/**
 * Calcule les agrégats du tableau de bord sur la période demandée.
 *
 * @param {string} [periode='mois']  'semaine' | 'mois' | 'semestre'.
 *   Toute autre valeur retombe sur 'mois'.
 * @returns {Promise<{
 *   parCategorie: Array<{ categorie: string, total: number }>,
 *   parLieu: Array<{ batiment: string, salle: string, total: number }>,
 *   parStatut: Array<{ statut: string, total: number }>,
 *   delaiMoyenHeures: number|null,
 *   total: number
 * }>}
 */
async function calculerStats(periode = PERIODE_PAR_DEFAUT) {
  const { intervalle } = resoudreIntervalle(periode);

  // Filtre commun : tickets créés dans la fenêtre glissante [now - intervalle ; now].
  // L'intervalle vient exclusivement de la liste blanche et est passé en
  // paramètre ($1) — aucune concaténation de valeur utilisateur (RG 9.3).
  const [parCategorie, parLieu, parStatut, delai, total] = await Promise.all([
    // Nombre de tickets par libellé de catégorie.
    db.query(
      `SELECT c.libelle AS categorie,
              COUNT(*)::int AS total
         FROM ticket t
         JOIN categorie c ON c.id = t.categorie_id
        WHERE t.cree_le >= now() - $1::interval
        GROUP BY c.libelle
        ORDER BY total DESC, c.libelle ASC`,
      [intervalle]
    ),

    // Top 5 des lieux (bâtiment/salle) par nombre de tickets.
    db.query(
      `SELECT l.batiment,
              l.salle,
              COUNT(*)::int AS total
         FROM ticket t
         JOIN lieu l ON l.id = t.lieu_id
        WHERE t.cree_le >= now() - $1::interval
        GROUP BY l.batiment, l.salle
        ORDER BY total DESC, l.batiment ASC, l.salle ASC
        LIMIT 5`,
      [intervalle]
    ),

    // Nombre de tickets par statut.
    db.query(
      `SELECT t.statut,
              COUNT(*)::int AS total
         FROM ticket t
        WHERE t.cree_le >= now() - $1::interval
        GROUP BY t.statut
        ORDER BY t.statut ASC`,
      [intervalle]
    ),

    // Délai moyen de résolution en heures sur les tickets RÉSOLUS uniquement
    // (RG-14, exigence 7.3). AVG renvoie NULL s'il n'y a aucun ticket résolu.
    db.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (t.resolu_le - t.cree_le)) / 3600.0) AS delai_moyen_heures
         FROM ticket t
        WHERE t.cree_le >= now() - $1::interval
          AND t.statut = 'Résolu'
          AND t.resolu_le IS NOT NULL`,
      [intervalle]
    ),

    // Nombre total de tickets sur la période.
    db.query(
      `SELECT COUNT(*)::int AS total
         FROM ticket t
        WHERE t.cree_le >= now() - $1::interval`,
      [intervalle]
    ),
  ]);

  // Délai moyen : arrondi à 1 décimale, ou null si aucun ticket résolu.
  const delaiBrut = delai.rows[0] ? delai.rows[0].delai_moyen_heures : null;
  const delaiMoyenHeures =
    delaiBrut === null || delaiBrut === undefined
      ? null
      : Math.round(Number(delaiBrut) * 10) / 10;

  const totalGeneral = total.rows[0] ? total.rows[0].total : 0;

  return {
    parCategorie: parCategorie.rows,
    parLieu: parLieu.rows,
    parStatut: parStatut.rows,
    delaiMoyenHeures,
    total: totalGeneral,
  };
}

module.exports = {
  calculerStats,
  // Exportés pour les tests unitaires (liste blanche des intervalles).
  INTERVALLES_PERIODE,
  PERIODE_PAR_DEFAUT,
};
