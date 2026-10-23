// Middleware d'autorisation : à utiliser après `auth`. Autorise uniquement les
// rôles passés en argument, ex. requireRole('technicien', 'admin').
// Un rôle non autorisé → 403 (RG : accès réservé à un autre rôle).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès interdit pour votre rôle' });
    }
    return next();
  };
}

module.exports = requireRole;
