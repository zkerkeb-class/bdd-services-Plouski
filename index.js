require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
const tripRoutes = require('./routes/tripRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const metricsRoutes = require('./routes/metricsRoutes');
const messageRoutes = require('./routes/messageRoutes');
const adminRoutes = require("./routes/adminRoutes");

// MÉTRIQUES (pour Prometheus)
const { httpRequestsTotal, httpDurationHistogram } = require('./services/metricsServices');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 5002;

console.log('🔥 Démarrage du data service...');

// MIDDLEWARES DE BASE
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// RATE LIMITING MVP
if (process.env.NODE_ENV === 'production') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { 
      success: false,
      error: 'Trop de requêtes, veuillez réessayer plus tard' 
    }
  });
  app.use(limiter);
} else {
  const devLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 1000,
    message: { error: 'Trop de requêtes (dev)' }
  });
  app.use(devLimiter);
}

// MÉTRIQUES PROMETHEUS
app.use((req, res, next) => {
  const start = process.hrtime();
  
  res.on('finish', () => {
    const duration = process.hrtime(start);
    const seconds = duration[0] + duration[1] / 1e9;

    httpRequestsTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
    });

    httpDurationHistogram.observe({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
    }, seconds);
  });

  next();
});

// ROUTES API
app.use('/api/roadtrips', tripRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// ROUTE MÉTRIQUES (pour Prometheus)
app.use('/metrics', metricsRoutes);

// HEALTH CHECK
app.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'OK',
    service: 'data-service',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

// GESTION D'ERREURS
app.use(notFoundHandler);
app.use(errorHandler);

// DÉMARRAGE SERVEUR
async function startServer() {
  try {
    // Connexion MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('✅ MongoDB connecté');

    // Démarrage serveur
    app.listen(PORT, () => {
      logger.info(`🚀 Data service sur http://localhost:${PORT}`);
      logger.info(`📊 Métriques: http://localhost:${PORT}/metrics`);
    });

  } catch (error) {
    logger.error('❌ Erreur démarrage:', error);
    process.exit(1);
  }
}

// ARRÊT GRACIEUX
process.on('SIGTERM', async () => {
  logger.info('🛑 Arrêt du serveur...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('🛑 Arrêt du serveur...');
  await mongoose.connection.close();
  process.exit(0);
});

startServer();

module.exports = app;