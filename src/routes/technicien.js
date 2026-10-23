// Routes de la file du technicien (US-03, exigences 4.1 et 4.6).
//
// GET /api/technicien/tickets — réservé aux rôles technicien et admin
// (auth + requireRole('technicien','admin')). Renvoie les tickets assignés à
// l'utilisateur courant (req.user.id) et non résolus (statut != 'Résolu'),
// triés par priorité (Critique, Haute, Normale, Basse) puis par date de
// création croissante.
//
// Tri imposé par design.md :
//   ORDER BY CASE priorite WHEN 'Critique' THEN 1 WHEN 'Haute' THEN 2
//            WHEN 'Normale' THEN 3 ELSE 4 END, cree_le ASC
//
// Les champs renvoyés alimentent la file côté UI : id, numero, description,
// statut, priorite, en_retard, cree_le, plus le libellé de la catégorie et le
// lieu (batiment/salle) via jointures.
//
// Toutes les requêtes SQL sont paramétrées (RG 9.3).
const express = require('express');

const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// GET /api/technicien/tickets — file triée du technicien connecté.
router.get(
  '/tickets',
  auth,
  requireRole('technicien', 'admin'),
  async (req, res, next) => {
    try {
      const resultat = await db.query(
        `SELECT t.id,
                t.numero,
                t.description,
                t.statut,
                t.priorite,
                t.en_retard,
                t.cree_le,
                c.libelle AS categorie,
                l.batiment,
                l.salle
           FROM ticket t
           JOIN categorie c ON c.id = t.categorie_id
           JOIN lieu l ON l.id = t.lieu_id
          WHERE t.technicien_id = $1
            AND t.statut <> 'Résolu'
          ORDER BY CASE t.priorite
                     WHEN 'Critique' THEN 1
                     WHEN 'Haute' THEN 2
                     WHEN 'Normale' THEN 3
                     ELSE 4
                   END,
                   t.cree_le ASC`,
        [req.user.id]
      );

      return res.json({ tickets: resultat.rows });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
