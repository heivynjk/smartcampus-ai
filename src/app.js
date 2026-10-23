// Application Express : sert le frontend statique (public/) et l'API (/api).
// Exporté sans démarrer le serveur ni le cron, pour être testable avec supertest.
const path = require('path');
const express = require('express');

const auth = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const referentielsRoutes = require('./routes/referentiels');
const ticketsRoutes = require('./routes/tickets');
const technicienRoutes = require('./routes/technicien');
const notificationsRoutes = require('./routes/notifications');
const chatRoutes = require('./routes/chat');
const statsRoutes = require('./routes/stats');

const app = express();

app.use(express.json());

// Frontend statique.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Route de santé : vérifie que l'application répond.
app.get('/api/sante', (req, res) => {
  res.json({ ok: true });
});

// Authentification (public).
app.use('/api/auth', authRoutes);

// Référentiels : accessibles à tout utilisateur authentifié (tous rôles).
app.use('/api/referentiels', auth, referentielsRoutes);

// Tickets : création d'un signalement et changement de statut
// (auth + rôle vérifiés dans les routes).
app.use('/api/tickets', ticketsRoutes);

// File du technicien : GET /api/technicien/tickets (auth + rôle dans la route).
app.use('/api/technicien', technicienRoutes);

// Notifications : GET /api/notifications et POST /api/notifications/:id/lue
// (auth dans les routes ; tous les rôles authentifiés).
app.use('/api/notifications', notificationsRoutes);

// Assistant IA : POST /api/chat (auth + requireRole('etudiant') dans la route).
app.use('/api/chat', chatRoutes);

// Tableau de bord : GET /api/stats (auth + requireRole('admin') dans la route).
app.use('/api/stats', statsRoutes);

// Les autres routes /api seront montées ici au fil des tâches suivantes.

// 404 pour les routes /api inconnues.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ressource introuvable' });
});

// Middleware d'erreur : les services lèvent des erreurs métier { status, message }.
// On renvoie { error: message } avec le bon code HTTP.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Erreur interne';
  if (status === 500) {
    console.error(err);
  }
  res.status(status).json({ error: message });
});

module.exports = app;
