// Routes du tableau de bord (US-06, exigences 7.1 à 7.6).
//
// GET /api/stats?periode=semaine|mois|semestre — réservé au rôle admin
// (auth + requireRole('admin')). Un étudiant ou un technicien reçoit 403
// (RG-15, exigence 7.5).
//
// La période provient du paramètre de requête et retombe sur 'mois' par défaut.
// Elle n'est jamais concaténée dans le SQL : statsService applique une liste
// blanche et passe l'intervalle en paramètre (RG 9.3, requêtes paramétrées).
//
// La réponse ne contient que des agrégats
// ({ parCategorie, parLieu, parStatut, delaiMoyenHeures, total }), sans aucun
// nom d'étudiant (exigence 7.6).
const express = require('express');

const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const statsService = require('../services/statsService');

const router = express.Router();

// GET /api/stats — agrégats du tableau de bord sur la période demandée.
router.get('/', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const periode = req.query.periode || statsService.PERIODE_PAR_DEFAUT;
    const stats = await statsService.calculerStats(periode);
    return res.json(stats);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
