const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

/* Middleware pour vérifier l'authentification utilisateur */
const authMiddleware = (req, res, next) => {
  if (req.isServiceRequest) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const tokenFromCookie = req.cookies?.token;
  const tokenFromQuery = req.query.token;

  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (tokenFromCookie) {
    token = tokenFromCookie;
  } else if (tokenFromQuery) {
    token = tokenFromQuery;
  }

  if (!token) {
    return res.status(401).json({ 
      success: false,
      message: 'Authentification requise'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role || 'user'
    };

    logger.debug('Utilisateur authentifié', {
      userId: decoded.userId,
      path: req.path,
      method: req.method
    });

    next();
  } catch (error) {
    logger.warn('Erreur de validation du token', {
      error: error.message,
      path: req.path,
      method: req.method
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Session expirée, veuillez vous reconnecter',
        code: 'TOKEN_EXPIRED'
      });
    }

    return res.status(401).json({ 
      success: false,
      message: 'Authentification invalide',
      code: 'INVALID_TOKEN'
    });
  }
};

/* Middleware pour vérifier les rôles utilisateur */
const roleMiddleware = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'Authentification requise'
      });
    }

    if (req.isServiceRequest) {
      return next();
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      logger.warn('Accès refusé - rôle insuffisant', {
        userId: req.user.userId,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
        method: req.method
      });

      return res.status(403).json({ 
        success: false,
        message: 'Accès refusé - permissions insuffisantes'
      });
    }

    next();
  };
};

module.exports = {
  authMiddleware,
  roleMiddleware
};