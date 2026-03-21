'use strict';
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { createVoucher }  = require('../services/accountingEngine');
const { getPagination, paginatedResponse } = require('../utils/helpers');

// GET /api/businesses/:businessId/vouchers
const listVouchers = asyncHandler(async (req, res) => {
  const bId  = req.businessId;
  const { page, limit, offset } = getPagination(req);
  const { type, from, to, search } = req.query;

  let   where  = 'WHERE business_id=$1';
  const params = [bId];
  let   idx    = 2;

  if (type)   { where += ` AND voucher_type=$${idx++}`; params.push(type); }
  if (from)   { where += ` AND voucher_date>=$${idx++}`; params.push(from); }
  if (to)     { where += ` AND voucher_date<=$${idx++}`; params.push(to); }
  if (search) { where += ` AND (voucher_number ILIKE $${idx} OR narration ILIKE $${idx})`; params.push(`%${search}%`); idx++; }

  const countRes = await query(`SELECT COUNT(*) FROM vouchers ${where}`, params);
  const result   = await query(
    `SELECT id, voucher_type, voucher_number, voucher_date, narration,
            total_debit, total_credit, is_balanced, is_posted
     FROM vouchers ${where}
     ORDER BY voucher_date DESC, created_at DESC
     LIMIT $${idx} OFFSET $${idx+1}`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(result.rows, parseInt(countRes.rows[0].count), getPagination(req).page, limit));
});

// GET /api/businesses/:businessId/vouchers/:id
const getVoucher = asyncHandler(async (req, res) => {
  const vRes = await query(
    'SELECT * FROM vouchers WHERE id=$1 AND business_id=$2',
    [req.params.id, req.businessId]
  );
  if (!vRes.rows.length) throw new AppError('Voucher not found', 404);

  const voucher = vRes.rows[0];
  const entries = await query(
    'SELECT * FROM ledger_entries WHERE voucher_id=$1 ORDER BY sort_order',
    [voucher.id]
  );
  voucher.entries = entries.rows;
  res.json({ voucher });
});

// POST /api/businesses/:businessId/vouchers  (manual journal entry)
const createManualVoucher = asyncHandler(async (req, res) => {
  const { voucherType, date, narration, reference, entries } = req.body;
  if (!date)     throw new AppError('date is required', 400);
  if (!entries?.length) throw new AppError('entries are required', 400);

  return withTransaction(async (client) => {
    const voucherId = await createVoucher(client, req.businessId, req.user.id, {
      voucherType: voucherType || 'Journal',
      date, narration, reference, entries,
    });
    const result = await client.query('SELECT * FROM vouchers WHERE id=$1', [voucherId]);
    res.status(201).json({ voucher: result.rows[0] });
  });
});

module.exports = { listVouchers, getVoucher, createManualVoucher };
