// Tests unitaires du service ticketService.creerTicket (tâche 4.1).
// La base est mockée : on remplace le module ../src/db dans le cache de require
// avant de charger le service (voir design.md « Testing Strategy »).
const test = require('node:test');
const assert = require('node:assert');

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

// Catégories de démo (Karim id 2 référent de toutes).
const categories = {
  2: { libelle: 'Matériel défectueux', priorite_defaut: 'Normale', technicien_referent_id: 2 },
  4: { libelle: 'Sécurité', priorite_defaut: 'Critique', technicien_referent_id: 2 },
};

// Registre de tickets simulés, indexé par id, utilisé par changerStatut.
// Réinitialisé avant chaque test concerné.
let ticketsSimules = {};

// Construit un faux client transactionnel qui enregistre les requêtes exécutées
// et simule les INSERT/SELECT/UPDATE ... RETURNING.
function fabriquerClient(journal) {
  let compteurTicket = 100;
  return {
    async query(text, params) {
      journal.push({ text, params });
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(text.trim())) {
        return { rows: [] };
      }
      if (/FROM categorie WHERE id/.test(text)) {
        const c = categories[params[0]];
        return { rows: c ? [c] : [] };
      }
      if (/FROM ticket WHERE id/.test(text)) {
        const t = ticketsSimules[params[0]];
        return { rows: t ? [t] : [] };
      }
      if (/^UPDATE ticket/.test(text.trim())) {
        // Paramètres : [nouveauStatut, estResolu, ticketId]
        const [nouveauStatut, estResolu, id] = params;
        const t = ticketsSimules[id];
        const majLe = new Date();
        const resoluLe = estResolu ? new Date() : t ? t.resolu_le || null : null;
        if (t) {
          t.statut = nouveauStatut;
          t.maj_le = majLe;
          t.resolu_le = resoluLe;
        }
        return {
          rows: [
            {
              id,
              numero: t ? t.numero : `INC-2026-00000`,
              statut: nouveauStatut,
              maj_le: majLe,
              resolu_le: resoluLe,
            },
          ],
        };
      }
      if (/INSERT INTO ticket/.test(text)) {
        compteurTicket += 1;
        const numero = `INC-2026-${String(compteurTicket).padStart(5, '0')}`;
        return { rows: [{ id: compteurTicket, numero, statut: 'Ouvert' }] };
      }
      return { rows: [] };
    },
    release() {},
  };
}

let dernierJournal = [];
const fakePool = {
  // Chaque connexion écrit dans le journal courant (réinitialisé par test).
  connect: async () => fabriquerClient(dernierJournal),
};
require.cache[cheminDb] = {
  id: cheminDb,
  filename: cheminDb,
  loaded: true,
  exports: { pool: fakePool, query: fakePool.query },
};

// Charger le service APRÈS avoir injecté le mock.
delete require.cache[require.resolve('../src/services/ticketService')];
const ticketService = require('../src/services/ticketService');

// Journal remis à zéro avant chaque test pour isoler les assertions.
test.beforeEach(() => {
  dernierJournal.length = 0;
});

// --- Création nominale ------------------------------------------------------
test('creerTicket crée un ticket Ouvert avec un numéro INC-AAAA-NNNNN', async () => {
  const res = await ticketService.creerTicket({
    auteurId: 1,
    categorieId: 2,
    lieuId: 3,
    description: 'Vidéoprojecteur HS en B204',
  });

  assert.ok(res.id, 'un id doit être renvoyé');
  assert.strictEqual(res.statut, 'Ouvert');
  assert.match(res.numero, /^INC-\d{4}-\d{5}$/);

  // Une ligne d'historique et une notification doivent avoir été insérées.
  const sqls = dernierJournal.map((q) => q.text);
  assert.ok(sqls.some((s) => /INSERT INTO historique_ticket/.test(s)), 'historique inséré');
  assert.ok(sqls.some((s) => /INSERT INTO notification/.test(s)), 'notification insérée');
  assert.ok(sqls.includes('COMMIT'), 'transaction validée');

  // La notification mentionne le numéro et « pris en compte » (RG 2.8).
  const notif = dernierJournal.find((q) => /INSERT INTO notification/.test(q.text));
  assert.ok(/pris en compte/.test(notif.params[2]));
  assert.ok(notif.params[2].includes(res.numero));
});

// --- RG-04 : priorité et référent de la catégorie ---------------------------
test('creerTicket applique la priorité par défaut et le référent de la catégorie (RG-04)', async () => {
  await ticketService.creerTicket({
    auteurId: 1,
    categorieId: 2,
    lieuId: 3,
    description: 'Clavier cassé',
  });

  const insert = dernierJournal.find((q) => /INSERT INTO ticket/.test(q.text));
  // Paramètres : [description, categorieId, lieuId, auteurId, technicienId, priorite, photoCle, origine]
  assert.strictEqual(insert.params[4], 2, 'assigné au référent (Karim)');
  assert.strictEqual(insert.params[5], 'Normale', 'priorité par défaut de la catégorie');
  assert.strictEqual(insert.params[7], 'formulaire', 'origine par défaut');
});

// --- RG-05 : Sécurité → Critique -------------------------------------------
test('creerTicket force la priorité à Critique pour la catégorie Sécurité (RG-05)', async () => {
  await ticketService.creerTicket({
    auteurId: 1,
    categorieId: 4,
    lieuId: 6,
    description: 'Porte de secours bloquée',
  });

  const insert = dernierJournal.find((q) => /INSERT INTO ticket/.test(q.text));
  assert.strictEqual(insert.params[5], 'Critique');
});

// --- origine 'assistant' ----------------------------------------------------
test('creerTicket enregistre origine = assistant quand demandé', async () => {
  await ticketService.creerTicket({
    auteurId: 1,
    categorieId: 2,
    lieuId: 3,
    description: 'Chaise cassée',
    origine: 'assistant',
  });

  const insert = dernierJournal.find((q) => /INSERT INTO ticket/.test(q.text));
  assert.strictEqual(insert.params[7], 'assistant');
});

// --- RG-01 : champs obligatoires -------------------------------------------
test('creerTicket refuse (400) si la description est manquante (RG-01)', async () => {
  await assert.rejects(
    () => ticketService.creerTicket({ auteurId: 1, categorieId: 2, lieuId: 3 }),
    (err) => err.status === 400 && typeof err.message === 'string'
  );
});

test('creerTicket refuse (400) si la catégorie est manquante (RG-01)', async () => {
  await assert.rejects(
    () => ticketService.creerTicket({ auteurId: 1, lieuId: 3, description: 'Test' }),
    (err) => err.status === 400
  );
});

test('creerTicket refuse (400) si le lieu est manquant (RG-01)', async () => {
  await assert.rejects(
    () => ticketService.creerTicket({ auteurId: 1, categorieId: 2, description: 'Test' }),
    (err) => err.status === 400
  );
});

// ===========================================================================
// changerStatut (tâche 5.1 — US-03)
// ===========================================================================

// Utilisateurs de référence pour les tests de changement de statut.
const karim = { id: 2, role: 'technicien' }; // technicien assigné aux tickets de démo
const autreTech = { id: 3, role: 'technicien' }; // technicien NON assigné
const sophie = { id: 4, role: 'admin' };

// Prépare un ticket simulé et renvoie son id.
function poserTicket({ id = 500, statut = 'Ouvert', technicienId = 2, auteurId = 1 } = {}) {
  ticketsSimules[id] = {
    id,
    numero: `INC-2026-${String(id).padStart(5, '0')}`,
    statut,
    auteur_id: auteurId,
    technicien_id: technicienId,
    maj_le: new Date('2026-01-01T00:00:00Z'),
    resolu_le: null,
  };
  return id;
}

test.beforeEach(() => {
  ticketsSimules = {};
});

// --- RG-09 : Ouvert → En cours (transition nominale) ------------------------
test('changerStatut autorise la transition Ouvert → En cours (RG-09)', async () => {
  const id = poserTicket({ statut: 'Ouvert' });
  const res = await ticketService.changerStatut({
    ticketId: id,
    utilisateur: karim,
    statut: 'En cours',
  });

  assert.strictEqual(res.statut, 'En cours');
  assert.strictEqual(res.resolu_le, null, 'resolu_le non renseigné hors Résolu');

  const sqls = dernierJournal.map((q) => q.text);
  assert.ok(sqls.some((s) => /INSERT INTO historique_ticket/.test(s)), 'historique inséré');
  assert.ok(sqls.some((s) => /INSERT INTO notification/.test(s)), 'notification insérée');
  assert.ok(sqls.includes('COMMIT'), 'transaction validée');
});

// --- RG-09 + RG-10 + RG-11 : En cours → Résolu avec commentaire -------------
test('changerStatut autorise En cours → Résolu avec commentaire et renseigne resolu_le (RG-10, RG-11)', async () => {
  const id = poserTicket({ statut: 'En cours' });
  const res = await ticketService.changerStatut({
    ticketId: id,
    utilisateur: karim,
    statut: 'Résolu',
    commentaire: 'Vidéoprojecteur remplacé.',
  });

  assert.strictEqual(res.statut, 'Résolu');
  assert.ok(res.resolu_le instanceof Date, 'resolu_le renseigné lors de la résolution');

  // La notification mentionne le numéro et le nouveau statut (RG-11).
  const notif = dernierJournal.find((q) => /INSERT INTO notification/.test(q.text));
  assert.ok(notif.params[2].includes(res.numero));
  assert.ok(/Résolu/.test(notif.params[2]));

  // L'historique conserve l'ancien et le nouveau statut + le commentaire.
  const hist = dernierJournal.find((q) => /INSERT INTO historique_ticket/.test(q.text));
  assert.strictEqual(hist.params[2], 'En cours', 'ancien statut');
  assert.strictEqual(hist.params[3], 'Résolu', 'nouveau statut');
  assert.strictEqual(hist.params[4], 'Vidéoprojecteur remplacé.', 'commentaire');
});

// --- RG-10 : Résolu sans commentaire → 400 ----------------------------------
test('changerStatut refuse (400) le passage à Résolu sans commentaire (RG-10)', async () => {
  const id = poserTicket({ statut: 'En cours' });
  await assert.rejects(
    () => ticketService.changerStatut({ ticketId: id, utilisateur: karim, statut: 'Résolu' }),
    (err) => err.status === 400 && typeof err.message === 'string'
  );
  assert.ok(dernierJournal.map((q) => q.text).includes('ROLLBACK'), 'transaction annulée');
});

// --- RG-09 : transition Ouvert → Résolu refusée -----------------------------
test('changerStatut refuse (400) la transition Ouvert → Résolu (RG-09)', async () => {
  const id = poserTicket({ statut: 'Ouvert' });
  await assert.rejects(
    () =>
      ticketService.changerStatut({
        ticketId: id,
        utilisateur: karim,
        statut: 'Résolu',
        commentaire: 'Peu importe',
      }),
    (err) => err.status === 400
  );
});

// --- RG-07 : technicien non assigné (et non admin) → 403 --------------------
test('changerStatut refuse (403) si l\'utilisateur n\'est ni le technicien assigné ni admin (RG-07)', async () => {
  const id = poserTicket({ statut: 'Ouvert', technicienId: 2 });
  await assert.rejects(
    () => ticketService.changerStatut({ ticketId: id, utilisateur: autreTech, statut: 'En cours' }),
    (err) => err.status === 403
  );
});

// --- RG-07 : un admin peut changer le statut d'un ticket qui ne lui est pas assigné
test('changerStatut autorise un admin même non assigné (RG-07)', async () => {
  const id = poserTicket({ statut: 'Ouvert', technicienId: 2 });
  const res = await ticketService.changerStatut({
    ticketId: id,
    utilisateur: sophie,
    statut: 'En cours',
  });
  assert.strictEqual(res.statut, 'En cours');
});

// --- Ticket introuvable → 404 -----------------------------------------------
test('changerStatut renvoie 404 si le ticket est introuvable', async () => {
  await assert.rejects(
    () => ticketService.changerStatut({ ticketId: 99999, utilisateur: karim, statut: 'En cours' }),
    (err) => err.status === 404
  );
});
