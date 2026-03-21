'use strict';
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { query } = require('../config/db');
const router  = express.Router();

// POST /api/sync  — receive offline queue from client, apply in order
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { businessId, items } = req.body;
  if (!items?.length) return res.json({ synced: 0, errors: [] });

  // Validate businessId is a UUID before touching the DB
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!businessId || !UUID_RE.test(businessId)) {
    return res.status(400).json({ error: 'Invalid businessId' });
  }

  // Verify user has access to this business (owner OR invited)
  const biz = await query(
    `SELECT b.id FROM businesses b
     LEFT JOIN user_roles ur ON ur.business_id = b.id
       AND ur.user_id = $2 AND ur.is_active = TRUE
     WHERE b.id = $1 AND b.is_active = TRUE
       AND (b.owner_id = $2 OR ur.id IS NOT NULL)`,
    [businessId, req.user.id]
  );
  if (!biz.rows.length) return res.status(403).json({ error: 'Access denied' });

  let synced = 0;
  const errors = [];

  for (const item of items) {
    try {
      await query(
        `INSERT INTO sync_queue (business_id, client_id, entity, operation, entity_id, local_id, payload, synced, synced_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,NOW())
         ON CONFLICT DO NOTHING`,
        [businessId, item.clientId || 'unknown', item.entity, item.operation, item.entityId || null, item.localId || null, JSON.stringify(item.payload)]
      );
      synced++;
    } catch (err) {
      errors.push({ localId: item.localId, error: err.message });
    }
  }

  res.json({ synced, errors });
}));

module.exports = router;
