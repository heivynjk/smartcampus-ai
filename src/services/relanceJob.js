// Relance des tickets non pris en charge (US / exigence 8, RG-08).
//
// Une tâche planifiée (node-cron) s'exécute toutes les heures (exigence 8.1).
// Elle est démarrée dans `server.js` via `demarrer()`, JAMAIS dans `app.js`,
// afin de ne pas tourner pendant les tests (voir design.md « Relance »).
//
// `relancer()` marque `en_retard = true` chaque ticket encore « Ouvert » depuis
// plus de 24 h et pas encore relancé, puis crée une notification in-app pour son
// auteur (exigence 8.2). Le garde `en_retard = false` dans le filtre garantit
// qu'un ticket n'est relancé qu'UNE SEULE fois (exigence 8.3) : une fois marqué
// `en_retard = true`, il ne ressort plus de la requête aux exécutions suivantes.
//
// Toutes les requêtes SQL sont paramétrées (RG 9.3).
const cron = require('node-cron');
const db = require('../db');

/**
 * Relance les tickets ouverts depuis plus de 24 h et non encore relancés.
 *
 * Déroulé (dans une transaction) :
 *  1. `UPDATE ticket ... RETURNING` : passe à `en_retard = true` tous les
 *     tickets `statut = 'Ouvert' AND en_retard = false AND
 *     cree_le < now() - interval '24 hours'`, et renvoie leur id, numéro et
 *     auteur. Le filtre `en_retard = false` assure l'unicité de la relance
 *     (exigence 8.3) : un ticket déjà marqué ne sera plus sélectionné.
 *  2. Pour chaque ticket relancé, insère une notification in-app destinée à
 *     l'auteur l'informant que son signalement n'a pas encore été pris en
 *     charge (exigence 8.2).
 *
 * @returns {Promise<{ nombre: number, tickets: Array<{ id:number, numero:string, auteurId:number }> }>}
 *   Le nombre de tickets relancés et la liste correspondante (utile pour la
 *   démonstration et les tests).
 */
async function relancer() {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Marque les tickets en retard et récupère ceux qui viennent d'être relancés.
    // Le filtre `en_retard = false` garantit la relance unique (exigence 8.3).
    const majResultat = await client.query(
      `UPDATE ticket
          SET en_retard = true
        WHERE statut = 'Ouvert'
          AND en_retard = false
          AND cree_le < now() - interval '24 hours'
        RETURNING id, numero, auteur_id`
    );

    const ticketsRelances = majResultat.rows.map((t) => ({
      id: t.id,
      numero: t.numero,
      auteurId: t.auteur_id,
    }));

    // Une notification in-app par ticket relancé, pour l'auteur (exigence 8.2).
    for (const ticket of ticketsRelances) {
      await client.query(
        `INSERT INTO notification (utilisateur_id, ticket_id, message)
         VALUES ($1, $2, $3)`,
        [
          ticket.auteurId,
          ticket.id,
          `Votre signalement ${ticket.numero} n'a pas encore été pris en charge.`,
        ]
      );
    }

    await client.query('COMMIT');
    return { nombre: ticketsRelances.length, tickets: ticketsRelances };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Référence vers la tâche planifiée, pour pouvoir l'arrêter si besoin.
let tacheProgrammee = null;

/**
 * Démarre la relance horaire (exigence 8.1). Appelée depuis `server.js`
 * uniquement — pas dans `app.js`, pour ne pas s'exécuter pendant les tests.
 *
 * Le cron s'exécute en haut de chaque heure (`0 * * * *`). Les erreurs de
 * `relancer()` sont capturées et journalisées pour ne pas interrompre la tâche.
 *
 * @returns {import('node-cron').ScheduledTask} La tâche planifiée.
 */
function demarrer() {
  tacheProgrammee = cron.schedule('0 * * * *', async () => {
    try {
      const { nombre } = await relancer();
      if (nombre > 0) {
        console.log(`Relance horaire : ${nombre} ticket(s) marqué(s) en retard.`);
      }
    } catch (err) {
      console.error('Échec de la relance horaire :', err);
    }
  });
  return tacheProgrammee;
}

module.exports = { relancer, demarrer };
