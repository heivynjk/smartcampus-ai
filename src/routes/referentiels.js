// Route des référentiels : GET /api/referentiels (tous les rôles authentifiés).
// Renvoie les catégories et les lieux pour alimenter les formulaires.
// → { categories: [...], lieux: [...] }
const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const categories = await db.query(
      'SELECT id, libelle, priorite_defaut FROM categorie ORDER BY id'
    );
    const lieux = await db.query(
      'SELECT id, batiment, salle FROM lieu ORDER BY batiment, salle'
    );

    return res.json({ categories: categories.rows, lieux: lieux.rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
