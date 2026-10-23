// Point d'entrée en production : démarre le serveur HTTP et la tâche planifiée.
// Le cron n'est PAS dans app.js pour ne pas tourner pendant les tests.
const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
  console.log(`SmartCampus en écoute sur le port ${config.port}`);
});

// La relance horaire (RG-08, exigence 8.1) est démarrée ici — pas dans app.js,
// pour ne pas tourner pendant les tests.
require('./services/relanceJob').demarrer();

module.exports = server;
