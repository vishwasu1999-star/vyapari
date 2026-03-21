'use strict';
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { createReceiptVoucher, createPaymentVoucher } = require('../services/accountingEngine');
const { ensurePartyAccount } = require('../services/invoiceService');
const { getPagination, paginatedResponse, toFloat, round2 } = require('../utils/helpers');
const { ACCOUNT_CODES } = require('../config/constants');

// ============================================================
// GET /api/businesses/:businessId/payments
// ============================================================
const listPayments = asyncHandler(async (req, res) => {
  const bId  = req.businessId;
  const { page, limit, offset } = getPagination(req);
  const { type, search, from, to } = req.query;

  let   where  = 'WHERE business_id=$1';
  const params = [bId];
  let   idx    = 2;

  if (type)   { where += ` AND payment_type=$${idx++}`; params.push(type); }
  if (from)   { where += ` AND payment_date>=$${idx++}`; params.push(from); }
  if (to)     { where += ` AND payment_date<=$${idx++}`; params.push(to); }
  if (search) {
    where += ` AND (party_name ILIKE $${idx} OR payment_number ILIKE $${idx})`;
    params.push(`%${search}%`); idx++;
  }

  const countRes = await query(`SELECT COUNT(*) FROM payments ${where}`, params);
  const result   = await query(
    `SELECT id, payment_type, payment_number, payment_date, party_name,
            amount, payment_mode, status, created_at
     FROM payments ${where}
     ORDER BY payment_date DESC, created_at DESC
     LIMIT $${idx} OFFSET $${idx+1}`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(result.rows, parseInt(countRes.rows[0].count), getPagination(req).page, limit));
});

// ============================================================
// POST /api/businesses/:businessId/payments
// Create receipt (customer pays us) or payment (we pay supplier)
// ============================================================
const createPayment = asyncHandler(async (req, res) => {
  const {
    paymentType, paymentDate, partyId, partyName,
    amount, paymentMode, bankAccountId,
    chequeNumber, chequeDate, transactionId,
    narration, reference,
    invoiceAllocations,  // [{invoiceId, amount}]
  } = req.body;

  if (!['receipt', 'payment'].includes(paymentType)) throw new AppError('paymentType must be receipt or payment', 400);
  if (!paymentDate) throw new AppError('paymentDate is required', 400);
  if (!amount || toFloat(amount) <= 0) throw new AppError('amount must be positive', 400);

  return withTransaction(async (client) => {
    // ── Fetch party ───────────────────────────────────────────
    let party = null;
    let partyAccountId = null;
    if (partyId) {
      const pRes = await client.query(
        'SELECT * FROM parties WHERE id=$1 AND business_id=$2',
        [partyId, req.businessId]
      );
      party          = pRes.rows[0];
      if (party) partyAccountId = await ensurePartyAccount(client, req.businessId, party);
    }

    // ── Resolve cash/bank account ─────────────────────────────
    let cashBankAccountId = bankAccountId || null;
    let cashBankCode      = null;
    if (!cashBankAccountId) {
      cashBankCode = paymentMode === 'bank' ? ACCOUNT_CODES.BANK : ACCOUNT_CODES.CASH;
    }

    // ── Generate payment number ───────────────────────────────
    const numRes = await client.query(
      'SELECT fn_next_invoice_number($1,$2) AS number',
      [req.businessId, paymentType === 'receipt' ? 'receipt' : 'payment']
    );
    const paymentNumber = numRes.rows[0].number;

    // ── Insert payment record ─────────────────────────────────
    const payRes = await client.query(
      `INSERT INTO payments (
         business_id, payment_type, payment_number, payment_date,
         party_id, party_name, amount, payment_mode,
         bank_account_id, cheque_number, cheque_date, transaction_id,
         narration, reference, status, created_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        req.businessId, paymentType, paymentNumber, paymentDate,
        partyId || null, party?.name || partyName || '',
        round2(toFloat(amount)), paymentMode || 'cash',
        cashBankAccountId, chequeNumber || null, chequeDate || null, transactionId || null,
        narration || null, reference || null, 'cleared', req.user.id,
      ]
    );
    const payment = payRes.rows[0];

    // ── Allocate to invoices ──────────────────────────────────
    let totalAllocated = 0;
    if (invoiceAllocations?.length) {
      for (const alloc of invoiceAllocations) {
        const allocAmt = round2(toFloat(alloc.amount));
        if (allocAmt <= 0) continue;

        // Validate invoice exists and belongs to this business
        const invCheck = await client.query(
          'SELECT id, balance_due FROM invoices WHERE id=$1 AND business_id=$2',
          [alloc.invoiceId, req.businessId]
        );
        if (!invCheck.rows.length) continue;
        if (toFloat(invCheck.rows[0].balance_due) < allocAmt - 0.01) {
          throw new AppError(`Allocation amount exceeds balance due on invoice`, 400);
        }

        await client.query(
          'INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES ($1,$2,$3)',
          [payment.id, alloc.invoiceId, allocAmt]
        );
        totalAllocated += allocAmt;
      }
      // Note: invoice status is updated by DB trigger fn_update_invoice_payment_status
    }

    // ── Create accounting voucher ─────────────────────────────
    const voucherOptions = {
      date:              paymentDate,
      partyAccountId,
      partyName:         party?.name || partyName || '',
      partyId:           partyId || null,
      amount:            round2(toFloat(amount)),
      cashBankAccountId,
      cashBankCode,
      reference:         paymentNumber,
      narration:         narration || (paymentType === 'receipt'
                          ? `Receipt from ${party?.name || partyName}`
                          : `Payment to ${party?.name || partyName}`),
      paymentId:         payment.id,
    };

    const voucherId = paymentType === 'receipt'
      ? await createReceiptVoucher(client, req.businessId, req.user.id, voucherOptions)
      : await createPaymentVoucher(client, req.businessId, req.user.id, voucherOptions);

    // Link voucher
    await client.query('UPDATE payments SET voucher_id=$1 WHERE id=$2', [voucherId, payment.id]);

    res.status(201).json({
      payment: { ...payment, voucher_id: voucherId },
      totalAllocated,
    });
  });
});

// ============================================================
// GET /api/businesses/:businessId/payments/:id
// ============================================================
const getPayment = asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM payments WHERE id=$1 AND business_id=$2',
    [req.params.id, req.businessId]
  );
  if (!result.rows.length) throw new AppError('Payment not found', 404);

  const payment = result.rows[0];

  // Allocations
  const allocs = await query(
    `SELECT pa.*, i.invoice_number, i.invoice_date, i.total_amount
     FROM payment_allocations pa
     JOIN invoices i ON i.id = pa.invoice_id
     WHERE pa.payment_id=$1`,
    [payment.id]
  );
  payment.allocations = allocs.rows;

  res.json({ payment });
});

module.exports = { listPayments, createPayment, getPayment };
