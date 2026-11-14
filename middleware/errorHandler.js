/**
 * Gestionnaire d'erreurs centralisé pour Express 5.
 * Express 5 gère nativement les promesses rejetées dans les handlers async,
 * donc ce middleware est principalement un formateur de réponse JSON.
 */

/**
 * Middleware "not found" : capture toute requête qui n'a pas matché
 * de route précédemment. Doit être monté APRÈS toutes les routes.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route introuvable : ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Middleware d'erreurs final : formatte toute erreur en JSON structuré.
 * Doit être monté EN DERNIER (4 arguments = signature spéciale Express).
 */
const errorHandler = (err, req, res, next) => {
  // Si la réponse est déjà partie, on délègue au handler par défaut d'Express
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Erreur interne du serveur';
  const isDev = process.env.NODE_ENV === 'development';

  // Erreurs Mongoose : CastError (ex: ObjectId invalide)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 400;
    message = `Identifiant invalide : ${err.value}`;
  }

  // Erreurs Mongoose : validation
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Données invalides';
  }

  // Erreurs Mongoose : duplicate key (ex: email déjà pris)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'champ';
    message = `Valeur déjà utilisée pour : ${field}`;
  }

  // Erreurs JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token invalide';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expiré';
  }

  // Fallback : SyntaxError venant de jwt.verify/jws (token ultra-malformé,
  // ex: payload non-base64). Cas rare mais possible — on garantit un 401.
  if (err.name === 'SyntaxError' && /jsonwebtoken|jws/i.test(err.stack || '')) {
    statusCode = 401;
    message = 'Token invalide ou malformé';
  }

  const payload = {
    success: false,
    error: {
      message,
      statusCode,
    },
  };

  // En développement, on ajoute la stack pour debug
  if (isDev) {
    payload.error.stack = err.stack;
  }

  // Log côté serveur (en dev uniquement pour éviter le bruit en prod)
  if (isDev || statusCode >= 500) {
    console.error(`❌ [${statusCode}] ${req.method} ${req.originalUrl} — ${message}`);
  }

  res.status(statusCode).json(payload);
};

module.exports = { notFound, errorHandler };