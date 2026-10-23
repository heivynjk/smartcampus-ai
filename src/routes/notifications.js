// Routes des notifications (US-02, exigence 3.4).
//
//   GET  /api/notifications          (tous les rôles authentifiés)
//        → { nonLues, items[] } : les notifications de l'utilisateur courant
//          (utilisateur_id = req.user.id), de la plus récente à la plus
//          ancienne, et le nombre de non lues (lue = false).
//
//   POST /api/notifications/:id/lue  (propriétaire uniquement)
//        → marque la notification comme lue (lue = true) et renvoie 204.
//          L'appartenance est garantie par la clause WHERE id = $1 AND
//          utilisateur_id = $2 : si rien n'est mis à jour, la notification
//          n'existe pas ou n'appartient pas à l'utilisateur → 404 (message
//          français).
//
// Toutes les requêtes SQL sont paramétrées (RG 9.3).
const express = require('express');

const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — notifications de l'utilisateur courant.
router.get('/', auth, async (req, res, next) => {
  try {
    const resultat = await db.query(
      `SELECT id, ticket_id, message, lue, cree_le
         FROM notification
        WHERE utilisateur_id = $1
        ORDER BY cree_le DESC`,
      [req.user.id]
    );

    const items = resultat.rows;
    const nonLues = items.reduce((total, n) => total + (n.lue ? 0 : 1), 0);

    return res.json({ nonLues, items });
  } catch (err) {
    return next(err);
  }
});

// POST /api/notifications/:id/lue — marque une notification comme lue.
// Propriétaire uniquement : la clause utilisateur_id = $2 empêche de modifier
// la notification d'un autre utilisateur.
router.post('/:id/lue', auth, async (req, res, next) => {
  try {
    const resultat = await db.query(
      `UPDATE notification
          SET lue = true
        WHERE id = $1 AND utilisateur_id = $2`,
      [req.params.id, req.user.id]
    );

    // Aucune ligne modifiée : la notification est introuvable ou n'appartient
    // pas à l'utilisateur courant.
    if (resultat.rowCount === 0) {
      throw { status: 404, message: 'Notification introuvable.' };
    }

    return res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
