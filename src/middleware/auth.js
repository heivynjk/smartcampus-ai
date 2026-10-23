// Middleware d'authentification : vérifie le JWT présent dans l'en-tête
// Authorization: Bearer <token>. En cas d'absence ou d'invalidité → 401.
// Sur succès, attache l'utilisateur décodé à req.user = { id, nom, role }.
const jwt = require('jsonwebtoken');
const config = require('../config');

function auth(req, res, next) {
  const entete = req.headers.authorization || '';
  const [schema, token] = entete.split(' ');

  if (schema !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  try {
    const charge = jwt.verify(token, config.jwtSecret);
    req.user = { id: charge.id, nom: charge.nom, role: charge.role };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Jeton invalide ou expiré' });
  }
}

module.exports = auth;
