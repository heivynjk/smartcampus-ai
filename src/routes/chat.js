// Route de l'assistant IA (US-04, exigences 5.1, 5.2, 5.3).
//
// POST /api/chat — réservé au rôle etudiant (auth + requireRole('etudiant')).
//
// Corps : { question, historique: [{ role, texte }] }.
//
// On interroge bedrockService.interroger({ question, historique }) (tâche 7.1)
// qui renvoie { reponse, source, incidentDetecte, categorie, lieu }. On en
// déduit (design.md « Assistant IA ») :
//   - proposerSignalement = incidentDetecte || source === null
//   - prefill = { description, categorieId, lieuId } où :
//       * description : la question de l'utilisateur (pré-remplissage raisonnable)
//       * categorieId : correspondance (insensible à la casse) du libellé de
//         catégorie renvoyé par le modèle avec le référentiel, sinon null
//       * lieuId : correspondance (insensible à la casse) du lieu renvoyé par
//         le modèle avec le référentiel (salle, ou « batiment salle »), sinon null
//
// Réponse : { reponse, source, incidentDetecte, proposerSignalement, prefill }.
//
// Les référentiels (catégories, lieux) sont lus via des SELECT simples
// paramétrés (RG 9.3). Les erreurs métier du service (ex. 503 si Bedrock est
// indisponible, exigence 5.7) sont propagées au middleware d'erreur via next().
const express = require('express');

const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const bedrockService = require('../services/bedrockService');

const router = express.Router();

/**
 * Normalise une chaîne pour une comparaison insensible à la casse et aux
 * espaces superflus. Renvoie '' pour toute valeur non chaîne.
 * @param {*} valeur
 * @returns {string}
 */
function normaliser(valeur) {
  return typeof valeur === 'string' ? valeur.trim().toLowerCase() : '';
}

/**
 * Retrouve l'id de la catégorie dont le libellé correspond (insensible à la
 * casse) à la catégorie renvoyée par le modèle.
 * @param {?string} libelleModele
 * @param {Array<{ id: number, libelle: string }>} categories
 * @returns {?number}
 */
function resoudreCategorieId(libelleModele, categories) {
  const cible = normaliser(libelleModele);
  if (!cible) {
    return null;
  }
  const trouvee = categories.find((c) => normaliser(c.libelle) === cible);
  return trouvee ? trouvee.id : null;
}

/**
 * Retrouve l'id du lieu dont la salle (ou « batiment salle ») correspond
 * (insensible à la casse) au lieu renvoyé par le modèle.
 * @param {?string} lieuModele
 * @param {Array<{ id: number, batiment: string, salle: string }>} lieux
 * @returns {?number}
 */
function resoudreLieuId(lieuModele, lieux) {
  const cible = normaliser(lieuModele);
  if (!cible) {
    return null;
  }
  const trouve = lieux.find((l) => {
    const salle = normaliser(l.salle);
    const complet = normaliser(`${l.batiment} ${l.salle}`);
    return salle === cible || complet === cible;
  });
  return trouve ? trouve.id : null;
}

// POST /api/chat — interroge l'assistant et calcule proposerSignalement/prefill.
router.post(
  '/',
  auth,
  requireRole('etudiant'),
  async (req, res, next) => {
    try {
      const { question, historique } = req.body || {};

      // Appel de l'assistant IA. Une erreur métier (ex. 503) est propagée.
      const resultat = await bedrockService.interroger({ question, historique });

      const proposerSignalement = resultat.incidentDetecte || resultat.source === null;

      // Référentiels pour résoudre categorieId / lieuId (SELECT paramétrés simples).
      const [categoriesRes, lieuxRes] = await Promise.all([
        db.query('SELECT id, libelle FROM categorie ORDER BY id'),
        db.query('SELECT id, batiment, salle FROM lieu ORDER BY batiment, salle'),
      ]);

      const prefill = {
        description: typeof question === 'string' ? question : '',
        categorieId: resoudreCategorieId(resultat.categorie, categoriesRes.rows),
        lieuId: resoudreLieuId(resultat.lieu, lieuxRes.rows),
      };

      return res.json({
        reponse: resultat.reponse,
        source: resultat.source,
        incidentDetecte: resultat.incidentDetecte === true,
        proposerSignalement,
        prefill,
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
