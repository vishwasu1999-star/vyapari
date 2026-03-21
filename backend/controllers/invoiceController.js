'use strict';
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { getPagination, paginatedResponse, numberToWords } = require('../utils/helpers');
const { createInvoice }   = require('../services/invoiceService');
const { reverseVoucher }  = require('../services/accountingEngine');

// ============================================================
// GET /api/businesses/:businessId/invoices
// ============================================================
const listInvoices = asyncHandler(async (req, res) => {
  const bId  = req.businessId;
  const { page, limit, offset } = getPagination(req);
  const { type = 'sale', status, search, from, to, partyId } = req.query;

  let   where  = 'WHERE i.business_id=$1 AND i.invoice_type=$2';
  const params = [bId, type];
  let   idx    = 3;

  if (status)  { where += ` AND i.status=$${idx++}`;      params.push(status); }
  if (partyId) { where += ` AND i.party_id=$${idx++}`;    params.push(partyId); }
  if (from)    { where += ` AND i.invoice_date>=$${idx++}`; params.push(from); }
  if (to)      { where += ` AND i.invoice_date<=$${idx++}`; params.push(to); }
  if (search)  {
    where += ` AND (i.invoice_number ILIKE $${idx} OR i.party_name ILIKE $${idx})`;
    params.push(`%${search}%`); idx++;
  }

  const countRes = await query(`SELECT COUNT(*) FROM invoices i ${where}`, params);
  const total    = parseInt(countRes.rows[0].count);

  const result = await query(
    `SELECT i.id, i.invoice_type, i.invoice_number, i.invoice_date, i.due_date,
            i.party_id, i.party_name, i.party_state,
            i.total_amount, i.amount_paid, i.balance_due, i.status,
            i.total_tax, i.is_inter_state, i.created_at
     FROM invoices i ${where}
     ORDER BY i.invoice_date DESC, i.created_at DESC
     LIMIT $${idx} OFFSET $${idx+1}`,
    [...params, limit, offset]
  );

  res.json(paginatedResponse(result.rows, total, page, limit));
});

// ============================================================
// GET /api/businesses/:businessId/invoices/:id
// ============================================================
const getInvoice = asyncHandler(async (req, res) => {
  // Invoice + business info for printing
  const invRes = await query(
    `SELECT i.*,
            b.name           AS business_name,
            b.legal_name     AS business_legal_name,
            b.address_line1  AS business_address,
            b.city           AS business_city,
            b.state          AS business_state,
            b.pincode        AS business_pincode,
            b.phone          AS business_phone,
            b.email          AS business_email,
            b.gst_number     AS business_gst,
            b.pan_number     AS business_pan,
            b.logo_url       AS business_logo
     FROM invoices i
     JOIN businesses b ON b.id = i.business_id
     WHERE i.id=$1 AND i.business_id=$2`,
    [req.params.id, req.businessId]
  );
  if (!invRes.rows.length) throw new AppError('Invoice not found', 404);

  const invoice = invRes.rows[0];

  // Line items
  const itemsRes = await query(
    'SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY sort_order',
    [invoice.id]
  );
  invoice.items          = itemsRes.rows;
  invoice.amount_in_words = numberToWords(parseFloat(invoice.total_amount));

  res.json({ invoice });
});

// ============================================================
// POST /api/businesses/:businessId/invoices
// ============================================================
const createInvoiceHandler = asyncHandler(async (req, res) => {
  const body = req.body;

  // ── Mandatory field validation ─────────────────────────────
  if (!body.invoiceDate) throw new AppError('invoiceDate is required', 400);

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(body.invoiceDate)) {
    throw new AppError('invoiceDate must be in YYYY-MM-DD format', 400);
  }

  if (body.dueDate && !dateRegex.test(body.dueDate)) {
    throw new AppError('dueDate must be in YYYY-MM-DD format', 400);
  }

  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    throw new AppError('At least one line item is required', 400);
  }

  if (body.items.length > 100) {
    throw new AppError('Maximum 100 line items per invoice', 400);
  }

  const invoiceType = body.invoiceType || 'sale';
  if (!['sale', 'purchase', 'credit_note', 'debit_note'].includes(invoiceType)) {
    throw new AppError('invoiceType must be sale, purchase, credit_note, or debit_note', 400);
  }

  // ── Validate each line item ────────────────────────────────
  for (let i = 0; i < body.items.length; i++) {
    const item = body.items[i];
    const prefix = `items[${i}]`;

    if (!item.itemName?.trim() && !item.name?.trim()) {
      throw new AppError(`${prefix}.itemName is required`, 400);
    }

    const qty  = parseFloat(item.quantity);
    const rate = parseFloat(item.rate);
    const gst  = parseFloat(item.gstRate || 0);
    const disc = parseFloat(item.discountPercent || 0);

    if (isNaN(qty) || qty <= 0) {
      throw new AppError(`${prefix}.quantity must be a positive number`, 400);
    }
    if (isNaN(rate) || rate < 0) {
      throw new AppError(`${prefix}.rate must be a non-negative number`, 400);
    }
    if (isNaN(gst) || gst < 0 || gst > 100) {
      throw new AppError(`${prefix}.gstRate must be between 0 and 100`, 400);
    }
    if (isNaN(disc) || disc < 0 || disc > 100) {
      throw new AppError(`${prefix}.discountPercent must be between 0 and 100`, 400);
    }
  }

  const invoice = await createInvoice(req.user.id, req.businessId, {
    ...body,
    invoiceType,
  });

  res.status(201).json({ invoice });
});

// ============================================================
// PATCH /api/businesses/:businessId/invoices/:id
// Update editable fields (only for draft or unpaid)
// ============================================================
const updateInvoice = asyncHandler(async (req, res) => {
  const { id }    = req.params;
  const { notes, terms, dueDate, referenceNumber } = req.body;

  // Check it exists + isn't cancelled/paid
  const check = await query(
    'SELECT id, status FROM invoices WHERE id=$1 AND business_id=$2',
    [id, req.businessId]
  );
  if (!check.rows.length)              throw new AppError('Invoice not found', 404);
  if (check.rows[0].status === 'paid') throw new AppError('Cannot edit a paid invoice', 400);
  if (check.rows[0].status === 'cancelled') throw new AppError('Cannot edit a cancelled invoice', 400);

  const result = await query(
    `UPDATE invoices SET
       notes=$1, terms_and_conditions=$2, due_date=$3,
       reference_number=$4, updated_at=NOW()
     WHERE id=$5 AND business_id=$6 RETURNING *`,
    [notes || null, terms || null, dueDate || null, referenceNumber || null, id, req.businessId]
  );

  res.json({ invoice: result.rows[0] });
});

// ============================================================
// DELETE /api/businesses/:businessId/invoices/:id  (cancel + reverse)
// ============================================================
const cancelInvoice = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  // Validate reason is provided
  if (!reason?.trim()) {
    throw new AppError('Cancellation reason is required', 400);
  }

  const check = await query(
    'SELECT id, status, voucher_id, invoice_number FROM invoices WHERE id=$1 AND business_id=$2',
    [id, req.businessId]
  );
  if (!check.rows.length)                    throw new AppError('Invoice not found', 404);
  if (check.rows[0].status === 'cancelled')  throw new AppError('Invoice is already cancelled', 400);
  if (check.rows[0].status === 'paid')       throw new AppError('Cannot cancel a paid invoice. Create a credit note instead.', 400);

  const invoice = check.rows[0];

  // Check no payments have been allocated
  const paymentCheck = await query(
    'SELECT COUNT(*) FROM payment_allocations WHERE invoice_id=$1',
    [id]
  );
  if (parseInt(paymentCheck.rows[0].count) > 0) {
    throw new AppError('Cannot cancel invoice with allocated payments. Remove payment allocations first.', 400);
  }

  await withTransaction(async (client) => {
    // 1. Cancel the invoice
    await client.query(
      `UPDATE invoices SET
         status='cancelled', cancelled_by=$1, cancelled_at=NOW(),
         cancellation_reason=$2, updated_at=NOW()
       WHERE id=$3`,
      [req.user.id, reason, id]
    );

    // 2. Reverse the accounting voucher (if one exists)
    if (invoice.voucher_id) {
      await reverseVoucher(
        client,
        req.businessId,
        req.user.id,
        invoice.voucher_id,
        new Date().toISOString().split('T')[0],
        `Cancellation of ${invoice.invoice_number}: ${reason}`
      );
    }
  });

  res.json({ message: 'Invoice cancelled and accounting entries reversed' });
});

// ============================================================
// GET /api/businesses/:businessId/invoices/:id/pdf-data
// Returns all data needed to render a PDF invoice
// ============================================================
const getPDFData = asyncHandler(async (req, res) => {
  const invRes = await query(
    `SELECT i.*,
            b.name AS business_name, b.legal_name AS business_legal_name,
            b.address_line1, b.city AS business_city, b.state AS business_state,
            b.pincode AS business_pincode, b.phone AS business_phone,
            b.email AS business_email, b.gst_number AS business_gst,
            b.pan_number AS business_pan, b.logo_url AS business_logo,
            b.website AS business_website
     FROM invoices i
     JOIN businesses b ON b.id = i.business_id
     WHERE i.id=$1 AND i.business_id=$2`,
    [req.params.id, req.businessId]
  );
  if (!invRes.rows.length) throw new AppError('Invoice not found', 404);

  const invoice = invRes.rows[0];
  const itemsRes = await query(
    'SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY sort_order',
    [invoice.id]
  );
  invoice.items          = itemsRes.rows;
  invoice.amount_in_words = numberToWords(parseFloat(invoice.total_amount));

  res.json({ invoice });
});

// ============================================================
// GET /api/businesses/:businessId/invoices/summary
// Quick dashboard stats
// ============================================================
const getSummary = asyncHandler(async (req, res) => {
  const bId = req.businessId;
  const { from, to, type = 'sale' } = req.query;

  let   where  = 'WHERE business_id=$1 AND invoice_type=$2 AND status != \'cancelled\'';
  const params = [bId, type];

  if (from) { where += ` AND invoice_date >= $${params.length + 1}`; params.push(from); }
  if (to)   { where += ` AND invoice_date <= $${params.length + 1}`; params.push(to);   }

  const result = await query(
    `SELECT
       COUNT(*)                                                AS count,
       COALESCE(SUM(total_amount),  0)                        AS total_amount,
       COALESCE(SUM(amount_paid),   0)                        AS amount_paid,
       COALESCE(SUM(balance_due),   0)                        AS balance_due,
       COALESCE(SUM(total_tax),     0)                        AS total_tax,
       COUNT(*) FILTER (WHERE status='paid')                  AS paid_count,
       COUNT(*) FILTER (WHERE status='unpaid')                AS unpaid_count,
       COUNT(*) FILTER (WHERE status='partial')               AS partial_count,
       COUNT(*) FILTER (WHERE status='overdue')               AS overdue_count
     FROM invoices
     ${where}`,
    params
  );

  res.json({ summary: result.rows[0] });
});

module.exports = {
  listInvoices, getInvoice, createInvoiceHandler,
  updateInvoice, cancelInvoice, getPDFData, getSummary,
};
