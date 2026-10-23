// Service métier des tickets (US-01 et suivants).
// Toutes les requêtes SQL sont paramétrées ($1, $2…) — jamais de concaténation
// de valeurs utilisateur dans le texte SQL (RG 9.3). Les erreurs métier sont
// levées sous la forme { status, message } ; le middleware d'erreur d'Express
// les transforme en { error: message } avec le bon code HTTP.
const db = require('../db');

/**
 * Crée un signalement (ticket) pour l'étudiant auteur.
 *
 * Règles appliquées :
 * - RG-01 : catégorie, lieu et description obligatoires, sinon 400.
 * - RG-03 : numéro unique `INC-AAAA-NNNNN` via la séquence `ticket_numero_seq`.
 * - RG-04 : assignation au technicien référent de la catégorie et priorité par
 *           défaut de la catégorie.
 * - RG-05 : catégorie « Sécurité » → priorité forcée à « Critique ».
 * - Première ligne d'historique (ancien statut NULL → « Ouvert »).
 * - RG 2.8 : notification in-app « pris en compte » pour l'auteur.
 *
 * @param {object} params
 * @param {number} params.auteurId   Id de l'étudiant qui crée le ticket.
 * @param {number|string} params.categorieId
 * @param {number|string} params.lieuId
 * @param {string} params.description
 * @param {string} [params.origine='formulaire']  'formulaire' ou 'assistant'.
 * @param {string} [params.photoCle]  Clé S3 de la photo jointe (optionnelle).
 * @returns {Promise<{ id:number, numero:string, statut:string }>}
 */
async function creerTicket({ auteurId, categorieId, lieuId, description, origine, photoCle } = {}) {
  // RG-01 : validation des champs obligatoires.
  const descriptionNettoyee = typeof description === 'string' ? description.trim() : '';
  if (!categorieId || !lieuId || !descriptionNettoyee) {
    throw { status: 400, message: 'La catégorie, le lieu et la description sont obligatoires.' };
  }

  // Origine : 'assistant' uniquement si explicitement demandé, sinon 'formulaire'.
  const origineTicket = origine === 'assistant' ? 'assistant' : 'formulaire';

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Catégorie : priorité par défaut et technicien référent (RG-04).
    const cat = await client.query(
      'SELECT libelle, priorite_defaut, technicien_referent_id FROM categorie WHERE id = $1',
      [categorieId]
    );
    const categorie = cat.rows[0];
    if (!categorie) {
      throw { status: 400, message: 'Catégorie introuvable.' };
    }

    // RG-05 : la catégorie « Sécurité » force la priorité à « Critique ».
    const priorite = categorie.libelle === 'Sécurité' ? 'Critique' : categorie.priorite_defaut;
    const technicienId = categorie.technicien_referent_id;

    // RG-03 : numéro `INC-AAAA-NNNNN` — même convention que le seed.
    // La valeur de la séquence est générée côté SQL (nextval) ; seules des
    // données paramétrées sont transmises.
    const insertion = await client.query(
      `INSERT INTO ticket
         (numero, description, categorie_id, lieu_id, auteur_id, technicien_id,
          statut, priorite, photo_cle, origine)
       VALUES
         ('INC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('ticket_numero_seq')::text, 5, '0'),
          $1, $2, $3, $4, $5, 'Ouvert', $6, $7, $8)
       RETURNING id, numero, statut`,
      [
        descriptionNettoyee,
        categorieId,
        lieuId,
        auteurId,
        technicienId,
        priorite,
        photoCle || null,
        origineTicket,
      ]
    );
    const ticket = insertion.rows[0];

    // Première ligne d'historique : création du signalement (RG 2.8).
    const commentaireHistorique =
      origineTicket === 'assistant' ? 'Signalement créé depuis l\'assistant.' : 'Signalement créé.';
    await client.query(
      `INSERT INTO historique_ticket
         (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire)
       VALUES ($1, $2, NULL, 'Ouvert', $3)`,
      [ticket.id, auteurId, commentaireHistorique]
    );

    // Notification in-app « pris en compte » pour l'auteur (RG 2.8).
    await client.query(
      `INSERT INTO notification (utilisateur_id, ticket_id, message)
       VALUES ($1, $2, $3)`,
      [auteurId, ticket.id, `Votre signalement ${ticket.numero} a bien été pris en compte.`]
    );

    await client.query('COMMIT');
    return { id: ticket.id, numero: ticket.numero, statut: ticket.statut };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Transitions de statut autorisées (RG-09) : seules ces deux transitions
// sont permises. Toute autre (y compris un statut identique ou
// Ouvert → Résolu) est refusée.
const TRANSITIONS_AUTORISEES = {
  Ouvert: ['En cours'],
  'En cours': ['Résolu'],
  Résolu: [],
};

/**
 * Change le statut d'un ticket (US-03).
 *
 * Règles appliquées :
 * - RG-07 : seul le technicien assigné au ticket OU un administrateur peut
 *           modifier le statut, sinon 403.
 * - RG-09 : transitions autorisées uniquement Ouvert → En cours et
 *           En cours → Résolu, sinon 400.
 * - RG-10 : le passage à « Résolu » exige un commentaire non vide, sinon 400.
 * - RG-11 : ligne d'historique, mise à jour de `maj_le` (et `resolu_le` si
 *           Résolu) et notification in-app pour l'auteur du ticket.
 *
 * @param {object} params
 * @param {number|string} params.ticketId
 * @param {{ id:number, role:string }} params.utilisateur  Utilisateur authentifié.
 * @param {string} params.statut       Nouveau statut souhaité.
 * @param {string} [params.commentaire] Commentaire (obligatoire pour Résolu).
 * @returns {Promise<{ id:number, numero:string, statut:string, maj_le:Date, resolu_le:Date|null }>}
 */
async function changerStatut({ ticketId, utilisateur, statut, commentaire } = {}) {
  const nouveauStatut = typeof statut === 'string' ? statut.trim() : '';
  const commentaireNettoye = typeof commentaire === 'string' ? commentaire.trim() : '';
  const util = utilisateur || {};

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Chargement du ticket (SQL paramétré).
    const res = await client.query(
      'SELECT id, numero, statut, auteur_id, technicien_id FROM ticket WHERE id = $1',
      [ticketId]
    );
    const ticket = res.rows[0];
    if (!ticket) {
      throw { status: 404, message: 'Ticket introuvable.' };
    }

    // RG-07 : seul le technicien assigné ou un admin peut modifier le statut.
    const estAdmin = util.role === 'admin';
    const estTechnicienAssigne = ticket.technicien_id === util.id;
    if (!estAdmin && !estTechnicienAssigne) {
      throw {
        status: 403,
        message: "Vous n'êtes pas autorisé à modifier le statut de ce ticket.",
      };
    }

    // RG-09 : vérifie que la transition est autorisée.
    const transitions = TRANSITIONS_AUTORISEES[ticket.statut] || [];
    if (!transitions.includes(nouveauStatut)) {
      throw {
        status: 400,
        message: `Transition de statut non autorisée : « ${ticket.statut} » → « ${nouveauStatut} ».`,
      };
    }

    // RG-10 : passage à « Résolu » → commentaire obligatoire.
    if (nouveauStatut === 'Résolu' && !commentaireNettoye) {
      throw {
        status: 400,
        message: 'Un commentaire est obligatoire pour résoudre un ticket.',
      };
    }

    // RG-11 : ligne d'historique de la transition.
    await client.query(
      `INSERT INTO historique_ticket
         (ticket_id, acteur_id, ancien_statut, nouveau_statut, commentaire)
       VALUES ($1, $2, $3, $4, $5)`,
      [ticket.id, util.id, ticket.statut, nouveauStatut, commentaireNettoye || null]
    );

    // Mise à jour du ticket : statut, maj_le = now() et resolu_le si Résolu.
    const estResolu = nouveauStatut === 'Résolu';
    const miseAJour = await client.query(
      `UPDATE ticket
          SET statut = $1,
              maj_le = now(),
              resolu_le = CASE WHEN $2 THEN now() ELSE resolu_le END
        WHERE id = $3
        RETURNING id, numero, statut, maj_le, resolu_le`,
      [nouveauStatut, estResolu, ticket.id]
    );
    const ticketMaj = miseAJour.rows[0];

    // Notification in-app pour l'auteur du ticket (RG-11).
    await client.query(
      `INSERT INTO notification (utilisateur_id, ticket_id, message)
       VALUES ($1, $2, $3)`,
      [
        ticket.auteur_id,
        ticket.id,
        `Votre signalement ${ticket.numero} est passé au statut « ${nouveauStatut} ».`,
      ]
    );

    await client.query('COMMIT');
    return {
      id: ticketMaj.id,
      numero: ticketMaj.numero,
      statut: ticketMaj.statut,
      maj_le: ticketMaj.maj_le,
      resolu_le: ticketMaj.resolu_le,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { creerTicket, changerStatut };
