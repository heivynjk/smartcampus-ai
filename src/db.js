// Pool PostgreSQL partagé. Toutes les requêtes utilisent des paramètres ($1, $2…)
// — jamais de concaténation de chaînes SQL (RG 9.3).
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
