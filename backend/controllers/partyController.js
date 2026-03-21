'use strict';
const { query }         = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { getPagination, paginatedResponse } = require('../utils/helpers');

// ============================================================
// GET /api/businesses/:businessId/parties
// ============================================================
const listParties = asyncHandler(async (req, res) => {
  const bId = req.businessId;
  const { page, limit, offset } = getPagination(req);
  const { type, search, sortBy = 'name', order = 'ASC' } = req.query;

  const allowed  = { name: 'p.name', created_at: 'p.created_at', city: 'p.city' };
  const sortCol  = allowed[sortBy] || 'p.name';
  const sortDir  = order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  let where  = 'WHERE p.business_id = $1 AND p.is_active = TRUE';
  const params = [bId];
  let idx = 2;

  if (type) {
    where += ` AND (p.party_type = $${idx} OR p.party_type = 'both')`;
    params.push(type); idx++;
  }
  if (search) {
    where += ` AND (p.name ILIKE $${idx} OR p.phone ILIKE $${idx} OR p.gst_number ILIKE $${idx} OR p.email ILIKE $${idx})`;
    params.push(`%${search}%`); idx++;
  }

  const countResult = await query(`SELECT COUNT(*) FROM parties p ${where}`, params);
  const total = parseInt(countResult.rows[0].count);

  const result = await query(
    `SELECT
       p.id, p.name, p.party_type, p.phone, p.email, p.gst_number,
       p.city, p.state, p.state_code, p.opening_balance, p.opening_balance_type,
       p.credit_limit, p.credit_days,
       COALESCE(
         (SELECT SUM(i.balance_due) FROM invoices i
          WHERE i.party_id = p.id AND i.invoice_type = 'sale' AND i.status IN ('unpaid','partial')),
         0
       ) AS outstanding_receivable,
       COALESCE(
         (SELECT SUM(i.balance_due) FROM invoices i
          WHERE i.party_id = p.id AND i.invoice_type = 'purchase' AND i.status IN ('unpaid','partial')),
         0
       ) AS outstanding_payable
     FROM parties p
     ${where}
     ORDER BY ${sortCol} ${sortDir}
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(result.rows, total, page, limit));
});

// ============================================================
// GET /api/businesses/:businessId/parties/:id
// ============================================================
const getParty = asyncHandler(async (req, res) => {
  const { id }  = req.params;
  const bId     = req.businessId;

  const result = await query(
    'SELECT * FROM parties WHERE id = $1 AND business_id = $2',
    [id, bId]
  );
  if (!result.rows.length) throw new AppError('Party not found', 404);

  const party = result.rows[0];

  // Outstanding amounts — scoped to this business
  const outstanding = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN invoice_type='sale'     THEN balance_due END),0) AS receivable,
       COALESCE(SUM(CASE WHEN invoice_type='purchase' THEN balance_due END),0) AS payable
     FROM invoices
     WHERE party_id=$1 AND business_id=$2 AND status IN ('unpaid','partial')`,
    [id, bId]
  );
  party.outstanding_receivable = parseFloat(outstanding.rows[0].receivable);
  party.outstanding_payable    = parseFloat(outstanding.rows[0].payable);

  // Recent transactions (last 10) — scoped to this business
  const txns = await query(
    `SELECT id, invoice_type, invoice_number, invoice_date, total_amount, balance_due, status
     FROM invoices WHERE party_id=$1 AND business_id=$2
     ORDER BY invoice_date DESC LIMIT 10`,
    [id, bId]
  );
  party.recent_transactions = txns.rows;

  res.json({ party });
});

// ============================================================
// POST /api/businesses/:businessId/parties
// ============================================================
const createParty = asyncHandler(async (req, res) => {
  const bId = req.businessId;
  const {
    name, partyType, gstNumber, panNumber,
    phone, alternatePhone, email, website,
    addressLine1, addressLine2, city, state, stateCode, pincode,
    openingBalance, openingBalanceType,
    creditLimit, creditDays, notes, tags,
  } = req.body;

  if (!name?.trim())  throw new AppError('Party name is required', 400);
  if (!partyType)     throw new AppError('Party type is required', 400);
  if (!['customer', 'supplier', 'both'].includes(partyType)) {
    throw new AppError("partyType must be 'customer', 'supplier', or 'both'", 400);
  }

  const result = await query(
    `INSERT INTO parties (
       business_id, name, party_type, gst_number, pan_number,
       phone, alternate_phone, email, website,
       address_line1, address_line2, city, state, state_code, pincode,
       opening_balance, opening_balance_type,
       credit_limit, credit_days, notes, tags
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [
      bId, name.trim(), partyType,
      gstNumber?.toUpperCase() || null, panNumber?.toUpperCase() || null,
      phone || null, alternatePhone || null, email?.toLowerCase() || null, website || null,
      addressLine1 || null, addressLine2 || null, city || null,
      state || null, stateCode || null, pincode || null,
      parseFloat(openingBalance) || 0, openingBalanceType || 'Dr',
      parseFloat(creditLimit) || 0, parseInt(creditDays) || 0,
      notes || null, tags || null,
    ]
  );

  res.status(201).json({ party: result.rows[0] });
});

// ============================================================
// PUT /api/businesses/:businessId/parties/:id
// ============================================================
const updateParty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const bId    = req.businessId;
  const {
    name, partyType, gstNumber, panNumber,
    phone, alternatePhone, email, website,
    addressLine1, addressLine2, city, state, stateCode, pincode,
    openingBalance, openingBalanceType,
    creditLimit, creditDays, notes, tags,
  } = req.body;

  const result = await query(
    `UPDATE parties SET
       name=$1, party_type=$2, gst_number=$3, pan_number=$4,
       phone=$5, alternate_phone=$6, email=$7, website=$8,
       address_line1=$9, address_line2=$10, city=$11, state=$12,
       state_code=$13, pincode=$14,
       opening_balance=$15, opening_balance_type=$16,
       credit_limit=$17, credit_days=$18, notes=$19, tags=$20,
       updated_at = NOW()
     WHERE id=$21 AND business_id=$22
     RETURNING *`,
    [
      name?.trim(), partyType, gstNumber?.toUpperCase() || null, panNumber?.toUpperCase() || null,
      phone || null, alternatePhone || null, email?.toLowerCase() || null, website || null,
      addressLine1 || null, addressLine2 || null, city || null, state || null,
      stateCode || null, pincode || null,
      parseFloat(openingBalance) || 0, openingBalanceType || 'Dr',
      parseFloat(creditLimit) || 0, parseInt(creditDays) || 0,
      notes || null, tags || null,
      id, bId,
    ]
  );
  if (!result.rows.length) throw new AppError('Party not found', 404);
  res.json({ party: result.rows[0] });
});

// ============================================================
// DELETE /api/businesses/:businessId/parties/:id  (soft delete)
// ============================================================
const deleteParty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  // Check for open invoices — scoped to this business
  const openInv = await query(
    `SELECT COUNT(*) FROM invoices WHERE party_id=$1 AND business_id=$2 AND status IN ('unpaid','partial')`,
    [id, req.businessId]
  );
  if (parseInt(openInv.rows[0].count) > 0) {
    throw new AppError('Cannot delete party with outstanding invoices', 400);
  }

  await query(
    'UPDATE parties SET is_active=FALSE, updated_at=NOW() WHERE id=$1 AND business_id=$2',
    [id, req.businessId]
  );
  res.json({ message: 'Party deleted successfully' });
});

module.exports = { listParties, getParty, createParty, updateParty, deleteParty };
