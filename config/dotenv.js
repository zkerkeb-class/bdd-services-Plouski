const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Fonction pour charger les variables d'environnement
const loadEnvironmentVariables = () => {

  // Déterminer l'environnement
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Chemin du fichier .env
  const envFilePath = path.resolve(
    process.cwd(), 
    nodeEnv === 'production' ? '.env.production' : '.env'
  );

  // Vérifier si le fichier .env existe
  if (fs.existsSync(envFilePath)) {
    dotenv.config({ path: envFilePath });
  } else {
    dotenv.config();
  }

  // Valeurs par défaut pour certaines variables
  process.env.PORT = process.env.PORT || '5002';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'info';
  
  // Validation des variables critiques
  const criticalVars = [
    'MONGO_URI', 
    'JWT_SECRET'
  ];

  criticalVars.forEach(varName => {
    if (!process.env[varName]) {
      console.error(`ERREUR : La variable d'environnement ${varName} est manquante !`);
      process.exit(1);
    }
  });
};

// Validation et sanitization des variables d'environnement
const validateEnvironmentVariables = () => {

  const port = parseInt(process.env.PORT, 10);

  if (isNaN(port) || port < 1024 || port > 65535) {
    console.error('Port invalide. Utilisation du port par défaut 5002');
    process.env.PORT = '5002';
  }

  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(process.env.LOG_LEVEL)) {
    process.env.LOG_LEVEL = 'info';
  }

  try {
    new URL(process.env.MONGO_URI);
  } catch (error) {
    console.error('URI MongoDB invalide');
    process.exit(1);
  }

  process.env.MAX_REQUEST_BODY_SIZE = process.env.MAX_REQUEST_BODY_SIZE || '1mb';
  
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
};

module.exports = {
  loadEnvironmentVariables,
  validateEnvironmentVariables
};