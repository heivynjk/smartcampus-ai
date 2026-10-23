// Initialisation de la base de démo SmartCampus AI.
//
// Étapes :
//   1. Supprime les tables (et la séquence) si elles existent.
//   2. Recrée le schéma (db/schema.sql).
//   3. Insère les 4 comptes de démo avec le mot de passe `demo1234` hashé
//      avec bcrypt (requête paramétrée — RG 9.3, le hash n'est jamais en dur
//      dans le SQL).
//   4. Insère le reste des données de démo (db/seed.sql).
//
// Lancement : `npm run db:init` (voir package.json).
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const SEED_PATH = path.join(__dirname, 'seed.sql');

// Ordre inverse des dépendances pour les DROP.
const DROP_SQL = `
  DROP TABLE IF EXISTS historique_ticket CASCADE;
  DROP TABLE IF EXISTS notification CASCADE;
  DROP TABLE IF EXISTS ticket CASCADE;
  DROP TABLE IF EXISTS categorie CASCADE;
  DROP TABLE IF EXISTS lieu CASCADE;
  DROP TABLE IF EXISTS faq CASCADE;
  DROP TABLE IF EXISTS utilisateur CASCADE;
  DROP SEQUENCE IF EXISTS ticket_numero_seq;
`;

// Les 4 comptes de démo (ordre fixe attendu par seed.sql : 1=Léa, 2=Karim,
// 3=Sophie, 4=Tom). Mot de passe commun : demo1234.
const UTILISATEURS = [
  { nom: 'Léa Martin', email: 'lea@campus.fr', role: 'etudiant' },
  { nom: 'Karim Benali', email: 'karim@campus.fr', role: 'technicien' },
  { nom: 'Sophie Durand', email: 'sophie@campus.fr', role: 'admin' },
  { nom: 'Tom Petit', email: 'tom@campus.fr', role: 'etudiant' },
];

const MOT_DE_PASSE_DEMO = 'demo1234';

async function main() {
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
    const seed = fs.readFileSync(SEED_PATH, 'utf8');
    const hash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 10);

    await client.query('BEGIN');

    console.log('→ Suppression des tables existantes…');
    await client.query(DROP_SQL);

    console.log('→ Création du schéma…');
    await client.query(schema);

    console.log('→ Insertion des utilisateurs de démo…');
    for (const u of UTILISATEURS) {
      await client.query(
        `INSERT INTO utilisateur (nom, email, mot_de_passe_hash, role)
         VALUES ($1, $2, $3, $4)`,
        [u.nom, u.email, hash, u.role]
      );
    }

    console.log('→ Insertion des données de démo (lieux, catégories, FAQ, tickets)…');
    await client.query(seed);

    await client.query('COMMIT');

    const { rows } = await client.query('SELECT count(*)::int AS n FROM ticket');
    console.log(`✔ Base initialisée : ${UTILISATEURS.length} utilisateurs, ${rows[0].n} tickets.`);
    console.log(`  Comptes de démo (mot de passe « ${MOT_DE_PASSE_DEMO} ») : ` +
      UTILISATEURS.map((u) => u.email).join(', '));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('✗ Échec de l\'initialisation de la base :', err.message);
    pool.end().finally(() => process.exit(1));
  });
