// Route d'authentification : POST /api/auth/login
// Corps : { email, motDePasse } → { token, utilisateur: { id, nom, role } }.
// Jeton JWT valable 8 h contenant id, nom et role (RG 1.1).
// Identifiants invalides → 401 « Identifiants invalides » (RG 1.2).
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');

const router = express.Router();

router.post('/login', async (req, res, next) => {
  try {
    const { email, motDePasse } = req.body || {};

    if (!email || !motDePasse) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const resultat = await db.query(
      'SELECT id, nom, role, mot_de_passe_hash FROM utilisateur WHERE email = $1',
      [email]
    );

    const utilisateur = resultat.rows[0];
    if (!utilisateur) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const valide = await bcrypt.compare(motDePasse, utilisateur.mot_de_passe_hash);
    if (!valide) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const charge = { id: utilisateur.id, nom: utilisateur.nom, role: utilisateur.role };
    const token = jwt.sign(charge, config.jwtSecret, { expiresIn: '8h' });

    return res.json({ token, utilisateur: charge });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
