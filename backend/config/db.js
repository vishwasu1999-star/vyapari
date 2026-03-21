'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const logger   = require('./logger');

// ============================================================
// PostgreSQL Connection Pool
// Supports both DATABASE_URL (Render/Railway/Supabase) and
// individual DB_* variables (local development).
// ============================================================

// Prefer DATABASE_URL if provided (standard on all PaaS platforms)
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL !== 'false'
        ? { rejectUnauthorized: false }   // Required for Render/Railway/Supabase
        : false,
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME     || 'vyapari_db',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl:      process.env.DB_SSL === 'true'
                  ? { rejectUnauthorized: false }
                  : false,
    };

const pool = new Pool({
  ...poolConfig,
  max:                     parseInt(process.env.DB_POOL_MAX)          || 20,
  idleTimeoutMillis:       parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECT_TIMEOUT) || 5000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { message: err.message });
});

pool.on('connect', () => {
  logger.debug('PostgreSQL client connected to pool');
});

// ── Verify connection on startup ──────────────────────────
const testConnection = async () => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() AS server_time, current_database() AS db');
    logger.info('✅  PostgreSQL connected', {
      database:    result.rows[0].db,
      server_time: result.rows[0].server_time,
    });
    return true;
  } catch (err) {
    logger.error('❌  PostgreSQL connection failed', { message: err.message });
    return false;
  } finally {
    if (client) client.release();
  }
};

// ── Simple query helper with slow-query logging ───────────
const query = (text, params) => {
  const start = Date.now();
  return pool.query(text, params).then((result) => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow query detected', { duration, query: text.substring(0, 120) });
    }
    return result;
  });
};

// ── Transaction helper ────────────────────────────────────
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, withTransaction, testConnection };
