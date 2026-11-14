const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware "protect" : vérifie le JWT et injecte req.user.
 * Usage : router.get('/me', protect, controller)
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // 1. Récupération du token (header Authorization: Bearer <token>)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Non authentifié : token manquant',
          statusCode: 401,
        },
      });
    }

    // 2. Vérification du JWT
    //    jwt.verify peut throw :
    //      - JsonWebTokenError (signature invalide, malformed)
    //      - TokenExpiredError (token expiré)
    //      - SyntaxError (payload non-JSON, cas très malformé → ex: "FAKE.FAKE")
    //    On catch ici pour garantir un 401 propre dans TOUS les cas.
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      const isExpired = jwtErr.name === 'TokenExpiredError';
      return res.status(401).json({
        success: false,
        error: {
          message: isExpired ? 'Token expiré' : 'Token invalide ou malformé',
          statusCode: 401,
        },
      });
    }

    // 3. Chargement de l'utilisateur (sans password)
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Non authentifié : utilisateur introuvable',
          statusCode: 401,
        },
      });
    }

    // 4. Vérification du flag "actif"
    if (!user.actif) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Compte désactivé',
          statusCode: 403,
        },
      });
    }

    // 5. Injection dans req pour les controllers suivants
    req.user = user;
    return next();
  } catch (err) {
    // Erreurs non-JWT (ex: MongoDB down) → errorHandler
    return next(err);
  }
};

/**
 * Middleware "requireRole" : à utiliser APRÈS "protect".
 * Exemple : router.get('/admin-only', protect, requireRole('admin'), controller)
 * Accepte un ou plusieurs rôles : requireRole('admin', 'dg')
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(500).json({
        success: false,
        error: {
          message: 'requireRole utilisé sans protect en amont',
          statusCode: 500,
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Accès refusé : rôle "${req.user.role}" non autorisé (requis : ${allowedRoles.join(', ')})`,
          statusCode: 403,
        },
      });
    }

    return next();
  };
};

module.exports = { protect, requireRole };