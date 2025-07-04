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
const { httpRequestsTotal, httpDurationHistogram } = require('./services/metricsServices');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const {
  register: standardRegister,
  httpRequestDuration: standardHttpDuration,
  httpRequestsTotal: standardHttpTotal,
  updateServiceHealth,
  updateActiveConnections,
  updateDatabaseHealth,
} = require('./metrics');

const app = express();
const PORT = process.env.PORT || 5002;
const METRICS_PORT = process.env.METRICS_PORT || 9002;
const SERVICE_NAME = "data-service";

console.log(`🔥 Démarrage du ${SERVICE_NAME}...`);

// MIDDLEWARES DE BASE

app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// RATE LIMITING

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

// MIDDLEWARE MÉTRIQUES

let currentConnections = 0;

app.use((req, res, next) => {
  const start = process.hrtime();
  const startMs = Date.now();
  
  currentConnections++;
  updateActiveConnections(currentConnections);
  
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

    const durationStandard = (Date.now() - startMs) / 1000;
    currentConnections--;
    updateActiveConnections(currentConnections);

    standardHttpDuration.observe(
      {
        method: req.method,
        route: req.route?.path || req.path,
        status_code: res.statusCode,
      },
      durationStandard
    );

    standardHttpTotal.inc({
      method: req.method,
      route: req.route?.path || req.path,
      status_code: res.statusCode,
    });

    logger.info(`${req.method} ${req.path} - ${res.statusCode} - ${Math.round(durationStandard * 1000)}ms`);
  });

  next();
});

// MONITORING MONGODB

mongoose.connection.on('connected', () => {
  logger.info('✅ MongoDB connecté');
  updateDatabaseHealth('mongodb', true);
});

mongoose.connection.on('error', (err) => {
  logger.error('❌ Erreur MongoDB:', err);
  updateDatabaseHealth('mongodb', false);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️ MongoDB déconnecté');
  updateDatabaseHealth('mongodb', false);
});

// ROUTES API

app.use('/api/roadtrips', tripRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// ROUTE MÉTRIQUES

app.use('/metrics', metricsRoutes);
app.get("/metrics-standard", async (req, res) => {
  res.set("Content-Type", standardRegister.contentType);
  res.end(await standardRegister.metrics());
});

// Health check enrichi
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: SERVICE_NAME,
    version: '1.0.0',
    database: {}
  };

  const dbState = mongoose.connection.readyState;
  if (dbState === 1) {
    health.database.mongodb = 'connected';
    updateDatabaseHealth('mongodb', true);
  } else {
    health.database.mongodb = 'disconnected';
    health.status = 'unhealthy';
    updateDatabaseHealth('mongodb', false);
  }

  const isHealthy = health.status === 'healthy';
  updateServiceHealth(SERVICE_NAME, isHealthy);

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(health);
});

// Vitals
app.get("/vitals", (req, res) => {
  const vitals = {
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    status: "running",
    active_connections: currentConnections,
    
    database: {
      mongodb: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        host: mongoose.connection.host || 'unknown',
        name: mongoose.connection.name || 'unknown',
        collections_count: Object.keys(mongoose.connection.collections).length
      }
    },
    
    api: {
      endpoints: [
        '/api/roadtrips',
        '/api/favorites', 
        '/api/messages',
        '/api/admin',
        '/api/auth',
        '/api/users'
      ],
      rate_limit: process.env.NODE_ENV === 'production' ? '500/15min' : '1000/1min',
      metrics_endpoints: [
        '/metrics (existing)',
        '/metrics-standard (new)',
        '/health',
        '/vitals'
      ]
    }
  };

  res.json(vitals);
});

// Ping
app.get("/ping", (req, res) => {
  res.json({
    status: "pong ✅",
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// GESTION D'ERREURS

app.use(notFoundHandler);
app.use(errorHandler);

// Gestion erreurs MongoDB spécifique
app.use((err, req, res, next) => {
  if (err.name === 'MongoError' || err.name === 'MongoServerError') {
    updateDatabaseHealth('mongodb', false);
    logger.error(`💥 Erreur MongoDB ${SERVICE_NAME}:`, err.message);
    return res.status(503).json({
      error: "Erreur base de données",
      service: SERVICE_NAME,
      message: "Service temporairement indisponible",
    });
  }
  next(err);
});

// DÉMARRAGE SERVEUR

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('✅ MongoDB connecté');
    updateDatabaseHealth('mongodb', true);

    app.listen(PORT, () => {
      console.log(`💾 ${SERVICE_NAME} démarré sur le port ${PORT}`);
      console.log(`📊 Métriques existantes: http://localhost:${PORT}/metrics`);
      console.log(`📊 Métriques standardisées: http://localhost:${PORT}/metrics-standard`);
      console.log(`❤️ Health: http://localhost:${PORT}/health`);
      console.log(`📈 Vitals: http://localhost:${PORT}/vitals`);
      
      updateServiceHealth(SERVICE_NAME, true);
      logger.info(`✅ ${SERVICE_NAME} avec métriques démarré`);
    });

    const metricsApp = express();
    metricsApp.get('/metrics', async (req, res) => {
      res.set('Content-Type', standardRegister.contentType);
      res.end(await standardRegister.metrics());
    });

    metricsApp.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: `${SERVICE_NAME}-metrics` });
    });

    metricsApp.listen(METRICS_PORT, () => {
      console.log(`📊 Serveur métriques standardisées sur le port ${METRICS_PORT}`);
      console.log(`🎯 Prometheus scrape: http://localhost:${METRICS_PORT}/metrics`);
    });

  } catch (error) {
    logger.error('❌ Erreur démarrage:', error);
    updateServiceHealth(SERVICE_NAME, false);
    updateDatabaseHealth('mongodb', false);
    process.exit(1);
  }
}

// ARRÊT GRACIEUX

async function gracefulShutdown(signal) {
  logger.info(`🛑 Arrêt ${SERVICE_NAME} (${signal})...`);
  updateServiceHealth(SERVICE_NAME, false);
  updateDatabaseHealth('mongodb', false);
  updateActiveConnections(0);
  
  try {
    await mongoose.connection.close();
    logger.info('✅ MongoDB fermé proprement');
  } catch (error) {
    logger.error('❌ Erreur fermeture MongoDB:', error);
  }
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
  updateServiceHealth(SERVICE_NAME, false);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  updateServiceHealth(SERVICE_NAME, false);
  process.exit(1);
});

startServer();

module.exports = app;