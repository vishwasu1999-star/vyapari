#!/usr/bin/env node
/**
 * VYAPARI — Database Setup Script
 * Runs setup_production.sql against the configured database.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node backend/scripts/dbSetup.js
 */

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const sqlPath = path.join(__dirname, '../../database/setup_production.sql');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME     || 'vyapari_db',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      }
);

async function setup() {
  const client = await pool.connect();
  try {
    console.log('🗄️   Running database setup...');
    console.log(`   SQL file: ${sqlPath}`);

    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);

    console.log('✅  Database setup complete.\n');
    console.log('   Next step: node backend/scripts/dbSeed.js');
  } catch (err) {
    console.error('❌  Setup failed:', err.message);
    if (err.position) {
      console.error('   At SQL position:', err.position);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
