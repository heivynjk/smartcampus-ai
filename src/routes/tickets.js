// Routes des tickets.
// POST /api/tickets (etudiant) : crée un signalement (US-01, exigences 2.2/2.7).
//
// Le corps est en multipart/form-data (champs texte + photo optionnelle) :
//   categorieId, lieuId, description, origine?, photo?
//
// Le middleware multer `uploadPhoto` lit le fichier en mémoire ; ses erreurs
// (taille/type) sont converties en 400 français via `erreurUploadEnFrancais`.
//
// La génération du numéro est faite par ticketService.creerTicket. Pour
// stocker la clé S3 de la photo, on crée d'abord le ticket (ce qui donne le
// numéro), puis on téléverse la photo sous ce numéro et on met à jour
// `ticket.photo_cle`. Si l'upload échoue, le ticket reste créé mais sans photo
// (l'étudiant pourra toujours suivre sa demande) et l'erreur est propagée.
//
// Toutes les requêtes SQL sont paramétrées (RG 9.3).
const express = require('express');

const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const ticketService = require('../services/ticketService');
const s3Service = require('../services/s3Service');
const {
  uploadPhoto,
  televerserPhoto,
  erreurUploadEnFrancais,
} = s3Service;

const router = express.Router();

/**
 * Enveloppe le middleware multer `uploadPhoto` pour convertir ses erreurs
 * (dépassement de taille, type non autorisé) en erreur métier française 400.
 * Les erreurs non reconnues sont propagées telles quelles.
 */
function gererUploadPhoto(req, res, next) {
  uploadPhoto(req, res, (err) => {
    if (err) {
      const erreurFr = erreurUploadEnFrancais(err);
      return next(erreurFr || err);
    }
    return next();
  });
}

// POST /api/tickets — réservé aux étudiants (auth + rôle etudiant).
router.post('/', auth, requireRole('etudiant'), gererUploadPhoto, async (req, res, next) => {
  try {
    const { categorieId, lieuId, description, origine } = req.body || {};

    // Création du ticket : la validation RG-01 (champs obligatoires) et la
    // génération du numéro sont gérées par le service.
    const ticket = await ticketService.creerTicket({
      auteurId: req.user.id,
      categorieId,
      lieuId,
      description,
      origine,
    });

    // Photo optionnelle : téléversée sous le numéro du ticket, puis la clé est
    // enregistrée sur le ticket.
    if (req.file) {
      const cle = await televerserPhoto(ticket.numero, req.file);
      await db.query('UPDATE ticket SET photo_cle = $1 WHERE id = $2', [cle, ticket.id]);
    }

    return res.status(201).json({
      id: ticket.id,
      numero: ticket.numero,
      statut: ticket.statut,
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/tickets/mes-tickets — liste les tickets de l'étudiant connecté (US-02, exigence 3.1).
//
// IMPORTANT : cette route DOIT être déclarée AVANT `GET /:id`, sinon Express
// interpréterait « mes-tickets » comme une valeur de `:id`.
//
// Réservé au rôle etudiant (auth + requireRole('etudiant')). Ne renvoie QUE les
// tickets dont l'auteur est l'utilisateur courant (auteur_id = req.user.id),
// du plus récent au plus ancien (ORDER BY cree_le DESC). Champs attendus :
// numero, categorie (libellé via jointure), lieu (batiment/salle via jointure),
// statut et date de dernière mise à jour (maj_le).
//
// Toutes les requêtes SQL sont paramétrées (RG 9.3).
router.get('/mes-tickets', auth, requireRole('etudiant'), async (req, res, next) => {
  try {
    const resultat = await db.query(
      `SELECT t.id,
              t.numero,
              c.libelle AS categorie,
              l.batiment,
              l.salle,
              t.statut,
              t.maj_le
         FROM ticket t
         JOIN categorie c ON c.id = t.categorie_id
         JOIN lieu l ON l.id = t.lieu_id
        WHERE t.auteur_id = $1
        ORDER BY t.cree_le DESC`,
      [req.user.id]
    );

    return res.json({ tickets: resultat.rows });
  } catch (err) {
    return next(err);
  }
});

// GET /api/tickets/:id — détail d'un ticket (US-02, exigences 3.2 et 3.3).
//
// Accessible à l'auteur du ticket, au technicien assigné ou à un admin.
// Contrôle d'accès RG-06 : un étudiant qui n'est pas l'auteur → 403 ; plus
// généralement, toute requête non-admin qui n'émane ni de l'auteur ni du
// technicien assigné → 403 (design.md : « auteur, technicien assigné, admin »).
// Un admin a toujours accès.
//
// Renvoie le détail du ticket (avec libellé de catégorie et lieu via jointures),
// `photoUrl` : URL présignée de la photo (null si aucune photo), et
// `historique[]` trié dans l'ordre chronologique (cree_le ASC) avec acteur,
// ancien_statut, nouveau_statut, commentaire et date.
//
// Toutes les requêtes SQL sont paramétrées (RG 9.3).
router.get('/:id', auth, async (req, res, next) => {
  try {
    const resTicket = await db.query(
      `SELECT t.id,
              t.numero,
              t.description,
              t.statut,
              t.priorite,
              t.origine,
              t.en_retard,
              t.photo_cle,
              t.cree_le,
              t.maj_le,
              t.resolu_le,
              t.auteur_id,
              t.technicien_id,
              c.libelle AS categorie,
              l.batiment,
              l.salle
         FROM ticket t
         JOIN categorie c ON c.id = t.categorie_id
         JOIN lieu l ON l.id = t.lieu_id
        WHERE t.id = $1`,
      [req.params.id]
    );
    const ticket = resTicket.rows[0];
    if (!ticket) {
      throw { status: 404, message: 'Ticket introuvable.' };
    }

    // Contrôle d'accès RG-06 : admin OK ; sinon seul l'auteur ou le technicien
    // assigné peut consulter le détail.
    const estAdmin = req.user.role === 'admin';
    const estAuteur = ticket.auteur_id === req.user.id;
    const estTechnicienAssigne = ticket.technicien_id === req.user.id;
    if (!estAdmin && !estAuteur && !estTechnicienAssigne) {
      throw {
        status: 403,
        message: "Vous n'êtes pas autorisé à consulter ce ticket.",
      };
    }

    // Historique chronologique (cree_le ASC), avec le nom de l'acteur.
    const resHistorique = await db.query(
      `SELECT h.id,
              h.acteur_id,
              u.nom AS acteur,
              h.ancien_statut,
              h.nouveau_statut,
              h.commentaire,
              h.cree_le AS date
         FROM historique_ticket h
         JOIN utilisateur u ON u.id = h.acteur_id
        WHERE h.ticket_id = $1
        ORDER BY h.cree_le ASC`,
      [ticket.id]
    );

    // URL présignée de la photo (null si aucune clé enregistrée).
    const photoUrl = await s3Service.urlPresignee(ticket.photo_cle);

    // On n'expose pas la clé S3 brute dans la réponse.
    const { photo_cle, ...detail } = ticket;

    return res.json({
      ...detail,
      photoUrl,
      historique: resHistorique.rows,
    });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/tickets/:id/statut — met à jour le statut d'un ticket (US-03).
//
// Réservé aux rôles technicien et admin (auth + requireRole). Le contrôle fin
// « technicien assigné ou admin » (RG-07) ainsi que les règles de transition
// (RG-09) et le commentaire obligatoire pour « Résolu » (RG-10) sont appliqués
// dans ticketService.changerStatut. Les erreurs métier levées { status, message }
// sont propagées au middleware d'erreur.
//
// Corps : { statut, commentaire? }. Renvoie le ticket mis à jour.
router.patch(
  '/:id/statut',
  auth,
  requireRole('technicien', 'admin'),
  async (req, res, next) => {
    try {
      const { statut, commentaire } = req.body || {};

      const ticket = await ticketService.changerStatut({
        ticketId: req.params.id,
        utilisateur: req.user,
        statut,
        commentaire,
      });

      return res.json(ticket);
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
