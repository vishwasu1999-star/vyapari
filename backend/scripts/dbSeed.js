#!/usr/bin/env node
/**
 * VYAPARI — Database Seed Script
 * Generates a real bcrypt hash and seeds the demo user + business.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node backend/scripts/dbSeed.js
 *   # or with individual vars:
 *   DB_HOST=localhost DB_NAME=vyapari_db ... node backend/scripts/dbSeed.js
 *
 * Safe to re-run (uses ON CONFLICT DO NOTHING).
 */

'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

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

async function seed() {
  const client = await pool.connect();
  try {
    console.log('🌱  Seeding database...');

    // Real bcrypt hash for "Password@123" (cost 12)
    const passwordHash = await bcrypt.hash('Password@123', 12);
    console.log('   ✅  Password hashed');

    await client.query('BEGIN');

    // ── Demo user ────────────────────────────────────────
    await client.query(`
      INSERT INTO users (id, name, email, password_hash, is_verified)
      VALUES (
        '00000000-0000-0000-0000-000000000001',
        'Rajesh Kumar',
        'demo@vyapari.app',
        $1,
        TRUE
      ) ON CONFLICT (email) DO UPDATE SET password_hash = $1
    `, [passwordHash]);
    console.log('   ✅  Demo user: demo@vyapari.app / Password@123');

    // ── Demo business ────────────────────────────────────
    await client.query(`
      INSERT INTO businesses (
        id, owner_id, name, legal_name, business_type,
        gst_number, pan_number, address_line1, city, state, state_code, pincode,
        phone, email, financial_year_start, sale_invoice_prefix, purchase_prefix,
        is_gst_registered
      ) VALUES (
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000001',
        'Shree Ram Traders', 'Shree Ram Traders', 'proprietorship',
        '27AABCU9603R1ZM', 'AABCU9603R',
        '123, Main Market, Shivaji Nagar', 'Pune', 'Maharashtra', '27', '411005',
        '9876543210', 'shreeramtraders@gmail.com', '2024-04-01',
        'SRT', 'PUR', TRUE
      ) ON CONFLICT DO NOTHING
    `);
    console.log('   ✅  Demo business: Shree Ram Traders');

    // ── Seed Chart of Accounts for demo business ─────────
    const bizCheck = await client.query(
      "SELECT COUNT(*) FROM accounts WHERE business_id = '00000000-0000-0000-0000-000000000002'"
    );
    if (parseInt(bizCheck.rows[0].count) === 0) {
      await client.query("SELECT fn_seed_chart_of_accounts('00000000-0000-0000-0000-000000000002')");
      console.log('   ✅  Chart of Accounts seeded (48 accounts including Round Off)');
    } else {
      console.log('   ⏭   Chart of Accounts already seeded — skipped');
    }

    // ── Demo HQ branch ────────────────────────────────────
    await client.query(`
      INSERT INTO branches (
        id, business_id, name, code, gst_number,
        address_line1, city, state, state_code, pincode, is_headquarters
      ) VALUES (
        '00000000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000002',
        'Main Branch', 'HQ', '27AABCU9603R1ZM',
        '123, Main Market, Shivaji Nagar', 'Pune', 'Maharashtra', '27', '411005', TRUE
      ) ON CONFLICT DO NOTHING
    `);

    // ── Demo parties ──────────────────────────────────────
    const parties = [
      ['00000000-0000-0000-0000-000000000010', 'Anand Wholesale Pvt Ltd', 'customer', '27AAAAA1234A1Z5', '9811112222', 'Mumbai', 'Maharashtra', '27'],
      ['00000000-0000-0000-0000-000000000011', 'Bharat Kirana Store',     'customer', null,              '9833334444', 'Pune',   'Maharashtra', '27'],
      ['00000000-0000-0000-0000-000000000012', 'Gujarat Distributors',    'supplier', '24BBBBB5678B2Z6', '9855556666', 'Ahmedabad', 'Gujarat', '24'],
    ];
    for (const [id, name, type, gst, phone, city, state, code] of parties) {
      await client.query(`
        INSERT INTO parties (id, business_id, name, party_type, gst_number, phone, city, state, state_code)
        VALUES ($1,'00000000-0000-0000-0000-000000000002',$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT DO NOTHING
      `, [id, name, type, gst, phone, city, state, code]);
    }
    console.log('   ✅  3 demo parties seeded');

    // ── Demo items ────────────────────────────────────────
    const items = [
      ['00000000-0000-0000-0000-000000000020', 'Basmati Rice (5kg)', 'goods', '1006',  'BAG', 5,  450, 380, 100],
      ['00000000-0000-0000-0000-000000000021', 'Toor Dal (1kg)',     'goods', '0713',  'KG',  5,  120,  95, 200],
      ['00000000-0000-0000-0000-000000000022', 'Sunflower Oil (1L)', 'goods', '1512',  'BTL', 5,  165, 140, 150],
      ['00000000-0000-0000-0000-000000000023', 'Delivery Charges',   'service','9965', 'PCS', 18, 100,   0,   0],
    ];
    for (const [id, name, type, hsn, unit, gst, sale, purchase, stock] of items) {
      await client.query(`
        INSERT INTO items (id, business_id, name, item_type, hsn_sac_code, unit,
          gst_rate, sale_price, purchase_price, opening_stock, current_stock,
          min_stock_alert, track_inventory)
        VALUES ($1,'00000000-0000-0000-0000-000000000002',$2,$3,$4,$5,$6,$7,$8,$9,$9,10,$10)
        ON CONFLICT DO NOTHING
      `, [id, name, type, hsn, unit, gst, sale, purchase, stock, type !== 'service']);
    }
    console.log('   ✅  4 demo items seeded');

    await client.query('COMMIT');
    console.log('\n🎉  Seed complete!');
    console.log('   Login: demo@vyapari.app');
    console.log('   Pass:  Password@123\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
