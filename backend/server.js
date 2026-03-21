'use strict';
require('dotenv').config();

const app    = require('./app');
const logger = require('./config/logger');
const { testConnection } = require('./config/db');

const PORT = parseInt(process.env.PORT) || 5000;

// ── Security: validate required environment variables ───────
const validateEnv = () => {
  // Accept DATABASE_URL (Render/Railway) OR individual DB_* vars
  const hasDb = process.env.DATABASE_URL || process.env.DB_PASSWORD;
  if (!hasDb) {
    logger.error('Missing database config: set DATABASE_URL or DB_PASSWORD');
    process.exit(1);
  }

  const requiredSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = requiredSecrets.filter(k => !process.env[k]);
  if (missing.length) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('See .env.example for required variables');
    process.exit(1);
  }

  // Block known placeholder values in production
  if (process.env.NODE_ENV === 'production') {
    const UNSAFE = ['replace_with', 'your_', 'placeholder', 'changeme', 'do_not_use'];
    for (const key of requiredSecrets) {
      const val = (process.env[key] || '').toLowerCase();
      if (UNSAFE.some(p => val.includes(p))) {
        logger.error(`${key} contains a placeholder value — set a real secret before deploying`);
        process.exit(1);
      }
    }
    for (const key of requiredSecrets) {
      if ((process.env[key] || '').length < 32) {
        logger.error(`${key} must be at least 32 characters in production`);
        process.exit(1);
      }
    }
  }
};

const start = async () => {
  validateEnv();

  // Verify DB connection before binding port
  const dbOk = await testConnection();
  if (!dbOk && process.env.NODE_ENV === 'production') {
    logger.error('Cannot start server — database connection failed');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(`🚀  Vyapari API running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
    // Force exit if shutdown takes too long
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception', { message: err.message, stack: err.stack });
    process.exit(1);
  });
};

start();
