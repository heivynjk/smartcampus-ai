// Tests unitaires du service statsService.calculerStats (tâche 8.1, US-06).
// La base est mockée en remplaçant ../src/db dans le cache de require avant de
// charger le service (voir design.md « Testing Strategy »). Le faux db.query
// enregistre chaque requête (texte + paramètres) et renvoie des lignes selon
// le motif SQL reconnu, ce qui permet de vérifier :
//   - la liste blanche période → intervalle (semaine/mois/semestre + défaut) ;
//   - le calcul du délai moyen en heures sur les tickets résolus uniquement ;
//   - la limite à 5 du top lieux ;
//   - la forme de l'objet renvoyé.
const test = require('node:test');
const assert = require('node:assert');

// --- Mock du module db ------------------------------------------------------
const cheminDb = require.resolve('../src/db');

// Journal des requêtes exécutées, réinitialisé avant chaque test.
let dernieresRequetes = [];

// Valeur de délai moyen (en heures) renvoyée par la requête de délai.
// Les tests l'ajustent pour vérifier l'arrondi et le cas « aucun résolu ».
let delaiMoyenRenvoye = null;

function fakeQuery(text, params) {
  dernieresRequetes.push({ text, params });

  // Délai moyen de résolution : renvoie la valeur configurée par le test.
  if (/delai_moyen_heures/.test(text)) {
    return Promise.resolve({ rows: [{ delai_moyen_heures: delaiMoyenRenvoye }] });
  }
  // Agrégat par catégorie.
  if (/JOIN categorie c/.test(text)) {
    return Promise.resolve({
      rows: [
        { categorie: 'Matériel défectueux', total: 3 },
        { categorie: 'Sécurité', total: 1 },
      ],
    });
  }
  // Top lieux : renvoie volontairement 5 lignes (le LIMIT est dans le SQL).
  if (/JOIN lieu l/.test(text)) {
    return Promise.resolve({
      rows: [
        { batiment: 'B', salle: 'B204', total: 4 },
        { batiment: 'A', salle: 'A12', total: 3 },
        { batiment: 'A', salle: 'A14', total: 2 },
        { batiment: 'B', salle: 'B210', total: 1 },
        { batiment: 'A', salle: 'Amphi A', total: 1 },
      ],
    });
  }
  // Agrégat par statut.
  if (/GROUP BY t\.statut/.test(text)) {
    return Promise.resolve({
      rows: [
        { statut: 'En cours', total: 2 },
        { statut: 'Ouvert', total: 1 },
        { statut: 'Résolu', total: 1 },
      ],
    });
  }
  // Total général.
  if (/SELECT COUNT\(\*\)::int AS total\s+FROM ticket t\s+WHERE/.test(text)) {
    return Promise.resolve({ rows: [{ total: 4 }] });
  }
  return Promise.resolve({ rows: [] });
}

require.cache[cheminDb] = {
  id: cheminDb,
  filename: cheminDb,
  loaded: true,
  exports: {
    pool: { query: fakeQuery, connect: async () => ({ query: fakeQuery, release() {} }) },
    query: fakeQuery,
  },
};

// Charger le service APRÈS avoir injecté le mock.
delete require.cache[require.resolve('../src/services/statsService')];
const statsService = require('../src/services/statsService');

test.beforeEach(() => {
  dernieresRequetes = [];
  delaiMoyenRenvoye = null;
});

// Renvoie l'intervalle ($1) passé à la première requête (identique pour toutes).
function intervalleUtilise() {
  assert.ok(dernieresRequetes.length > 0, 'au moins une requête doit être exécutée');
  const intervalles = dernieresRequetes.map((r) => r.params && r.params[0]);
  // Toutes les requêtes utilisent le même intervalle.
  for (const iv of intervalles) {
    assert.strictEqual(iv, intervalles[0]);
  }
  return intervalles[0];
}

// --- Liste blanche période → intervalle -------------------------------------
test("calculerStats('semaine') filtre sur un intervalle de 7 jours", async () => {
  await statsService.calculerStats('semaine');
  assert.strictEqual(intervalleUtilise(), '7 days');
});

test("calculerStats('mois') filtre sur un intervalle de 1 mois", async () => {
  await statsService.calculerStats('mois');
  assert.strictEqual(intervalleUtilise(), '1 month');
});

test("calculerStats('semestre') filtre sur un intervalle de 6 mois", async () => {
  await statsService.calculerStats('semestre');
  assert.strictEqual(intervalleUtilise(), '6 months');
});

// --- Période inconnue / absente → défaut 'mois' -----------------------------
test('calculerStats retombe sur la période par défaut (mois) pour une valeur inconnue', async () => {
  await statsService.calculerStats('annee');
  assert.strictEqual(intervalleUtilise(), '1 month');
});

test('calculerStats utilise la période par défaut (mois) sans argument', async () => {
  await statsService.calculerStats();
  assert.strictEqual(intervalleUtilise(), '1 month');
  assert.strictEqual(statsService.PERIODE_PAR_DEFAUT, 'mois');
});

// --- Requêtes paramétrées : l'intervalle est passé en $1, jamais concaténé ---
test("l'intervalle est passé en paramètre ($1::interval), pas concaténé dans le SQL", async () => {
  await statsService.calculerStats('semaine');
  for (const r of dernieresRequetes) {
    assert.match(r.text, /\$1::interval/, 'le SQL doit utiliser $1::interval');
    assert.deepStrictEqual(r.params, ['7 days']);
    // La valeur de l'intervalle ne doit pas apparaître en dur dans le texte SQL.
    assert.ok(!r.text.includes('7 days'), "l'intervalle ne doit pas être concaténé");
  }
});

// --- Délai moyen en heures sur les résolus uniquement -----------------------
test('le délai moyen est calculé en heures sur les tickets résolus uniquement (RG-14)', async () => {
  // 90 h de moyenne renvoyées par la base.
  delaiMoyenRenvoye = 90;
  const stats = await statsService.calculerStats('mois');
  assert.strictEqual(stats.delaiMoyenHeures, 90);

  // La requête de délai doit convertir des secondes en heures (/ 3600) et ne
  // porter que sur les tickets résolus.
  const requeteDelai = dernieresRequetes.find((r) => /delai_moyen_heures/.test(r.text));
  assert.ok(requeteDelai, 'une requête de délai moyen doit exister');
  assert.match(requeteDelai.text, /EXTRACT\(EPOCH FROM \(t\.resolu_le - t\.cree_le\)\)\s*\/\s*3600/);
  assert.match(requeteDelai.text, /t\.statut = 'Résolu'/);
});

test('le délai moyen est arrondi à une décimale', async () => {
  delaiMoyenRenvoye = 48.46;
  const stats = await statsService.calculerStats('mois');
  assert.strictEqual(stats.delaiMoyenHeures, 48.5);
});

test('le délai moyen est null quand aucun ticket résolu sur la période', async () => {
  delaiMoyenRenvoye = null; // AVG renvoie NULL s'il n'y a aucun résolu.
  const stats = await statsService.calculerStats('mois');
  assert.strictEqual(stats.delaiMoyenHeures, null);
});

// --- Top 5 lieux limité à 5 -------------------------------------------------
test('le top lieux est limité à 5 (LIMIT 5 dans le SQL)', async () => {
  const stats = await statsService.calculerStats('mois');
  const requeteLieux = dernieresRequetes.find((r) => /JOIN lieu l/.test(r.text));
  assert.ok(requeteLieux, 'une requête sur les lieux doit exister');
  assert.match(requeteLieux.text, /LIMIT 5/);
  assert.ok(stats.parLieu.length <= 5, 'au plus 5 lieux renvoyés');
});

// --- Forme de l'objet renvoyé -----------------------------------------------
test("calculerStats renvoie la forme attendue { parCategorie, parLieu, parStatut, delaiMoyenHeures, total }", async () => {
  delaiMoyenRenvoye = 12.3;
  const stats = await statsService.calculerStats('mois');

  assert.deepStrictEqual(Object.keys(stats).sort(), [
    'delaiMoyenHeures',
    'parCategorie',
    'parLieu',
    'parStatut',
    'total',
  ]);
  assert.ok(Array.isArray(stats.parCategorie));
  assert.ok(Array.isArray(stats.parLieu));
  assert.ok(Array.isArray(stats.parStatut));
  assert.strictEqual(typeof stats.delaiMoyenHeures, 'number');
  assert.strictEqual(stats.total, 4);

  // Contenu représentatif.
  assert.deepStrictEqual(stats.parCategorie[0], { categorie: 'Matériel défectueux', total: 3 });
  assert.deepStrictEqual(stats.parStatut.find((s) => s.statut === 'Résolu'), {
    statut: 'Résolu',
    total: 1,
  });
});
