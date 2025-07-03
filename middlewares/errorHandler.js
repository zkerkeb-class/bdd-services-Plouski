const logger = require('../utils/logger');

/* Ce middleware capture toutes les erreurs non gérées dans l'application
 * et les transforme en réponses HTTP standardisées et user-friendly.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Une erreur interne est survenue';
  let errorType = err.name || 'UnknownError';

  // Erreurs de validation Mongoose/Express-validator
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Données invalides';
    errorType = 'ValidationError';
  }

  // Erreurs MongoDB de clé dupliquée (unique constraint)
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    if (err.code === 11000) {
      statusCode = 409;
      message = 'Une ressource avec ces informations existe déjà';
      errorType = 'DuplicateKeyError';
      
      const duplicateField = Object.keys(err.keyValue || {})[0];
      if (duplicateField) {
        message = `${duplicateField} existe déjà`;
      }
    } else {
      statusCode = 500;
      message = 'Erreur de base de données';
      errorType = 'DatabaseError';
    }
  }

  // Erreurs de cast MongoDB (ID invalide)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Format d\'identifiant invalide';
    errorType = 'InvalidIdError';
  }

  // Erreurs JWT (Token invalide/expiré)
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token d\'authentification invalide';
    errorType = 'AuthenticationError';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token d\'authentification expiré';
    errorType = 'TokenExpiredError';
  }

  // Erreurs d'autorisation personnalisées
  if (err.name === 'UnauthorizedError' || statusCode === 403) {
    statusCode = 403;
    message = 'Accès refusé - Permissions insuffisantes';
    errorType = 'AuthorizationError';
  }

  // Erreurs de ressource non trouvée
  if (statusCode === 404) {
    message = err.message || 'Ressource non trouvée';
    errorType = 'NotFoundError';
  }

  // Erreurs de limite de taux (rate limiting)
  if (err.name === 'RateLimitError' || statusCode === 429) {
    statusCode = 429;
    message = 'Trop de requêtes, veuillez réessayer plus tard';
    errorType = 'RateLimitError';
  }

  // Erreurs de taille de fichier/payload
  if (err.name === 'PayloadTooLargeError' || err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'Fichier ou données trop volumineux';
    errorType = 'PayloadTooLargeError';
  }

  const logData = {
    message: err.message,
    errorType,
    statusCode,
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.userId || 'anonymous',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && {
      query: req.query,
      body: req.body ? JSON.parse(JSON.stringify(req.body).replace(/"password":\s*"[^"]*"/g, '"password":"[MASKED]"')) : undefined
    })
  };

  if (statusCode >= 500) {
    logger.error('Erreur serveur critique', { ...logData, stack: err.stack });
  } else if (statusCode >= 400) {
    logger.warn('Erreur client', logData);
  } else {
    logger.info('Erreur gérée', logData);
  }

  const errorResponse = {
    success: false,
    error: {
      type: errorType,
      message,
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path
    }
  };

  // Ajouter les détails de validation en cas d'erreur de validation
  if (err.name === 'ValidationError') {
    errorResponse.error.details = Object.values(err.errors).map(error => ({
      field: error.path,
      message: error.message,
      value: error.value
    }));
  }

  // Inclure la stack trace en développement uniquement
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.originalError = {
      name: err.name,
      code: err.code
    };
  }

  // Mode production : messages épurés pour la sécurité
  if (process.env.NODE_ENV === 'production') {
    if (statusCode >= 500) {
      errorResponse.error.message = 'Une erreur interne est survenue';
    }
  }

  // S'assurer que la réponse n'a pas déjà été envoyée
  if (res.headersSent) {
    logger.warn('Headers déjà envoyés, impossible de renvoyer la réponse d\'erreur');
    return next(err);
  }

  // Définir les headers de sécurité
  res.set({
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  });

  res.status(statusCode).json(errorResponse);
};

/* Pour capturer les routes non trouvées */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`Route non trouvée: ${req.method} ${req.path}`);
  error.statusCode = 404;
  error.name = 'NotFoundError';
  next(error);
};

/* Gestionnaire d'erreurs async pour éviter try/catch répétés */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/* Gestionnaire d'erruers non capturées au niveau processus */
const setupProcessErrorHandlers = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection:', {
      reason: reason?.message || reason,
      stack: reason?.stack,
      promise: promise
    });
    
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
      message: error.message,
      stack: error.stack
    });
    
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM reçu, arrêt gracieux du serveur...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT reçu, arrêt gracieux du serveur...');
    process.exit(0);
  });
};

module.exports = {
  errorHandler,
  notFoundHandler, 
  asyncHandler,
  setupProcessErrorHandlers
};