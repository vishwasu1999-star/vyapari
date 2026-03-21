'use strict';
const { query }    = require('../config/db');
const { AppError } = require('./errorHandler');

// ============================================================
// checkAuditLock
// Middleware factory — extracts the transaction date from
// req.body[dateField] and blocks if period is locked.
// ============================================================
const checkAuditLock = (dateField = 'date') => async (req, res, next) => {
  try {
    const dateValue = req.body?.[dateField] || req.body?.date || req.body?.invoiceDate;

    if (!dateValue) return next();

    const result = await query(
      'SELECT lock_date FROM businesses WHERE id=$1',
      [req.businessId]
    );
    const lockDate = result.rows[0]?.lock_date;

    if (!lockDate) return next();

    const txDate = new Date(dateValue);
    const lockDt = new Date(lockDate);

    if (txDate <= lockDt) {
      return next(new AppError(
        `Period is locked. Transactions on or before ${lockDate} cannot be created or edited. ` +
        `Contact your accountant to advance the lock date.`,
        423
      ));
    }

    next();
  } catch (err) {
    next(err);
  }
};

// ============================================================
// checkAuditLockForRecord
// For updates/deletes — fetches the existing record's date.
//
// SECURITY: table and dateColumn come from route-file call sites
// only, never from user input. We enforce a strict whitelist so
// no SQL identifier injection is possible even in theory.
// ============================================================

const AUDIT_LOCK_TARGETS = {
  'invoices': 'invoice_date',
  'vouchers': 'voucher_date',
  'payments': 'payment_date',
  'expenses': 'expense_date',
};

const checkAuditLockForRecord = (table, dateColumn = 'date') => async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id) return next();

    // Enforce whitelist — only known safe table/column combinations
    const safeTable  = AUDIT_LOCK_TARGETS[table] ? table : null;
    const safeColumn = AUDIT_LOCK_TARGETS[table] || null;

    if (!safeTable) {
      // Unknown table — skip lock check, let controller handle
      return next();
    }

    const result = await query(
      'SELECT lock_date FROM businesses WHERE id=$1',
      [req.businessId]
    );
    const lockDate = result.rows[0]?.lock_date;
    if (!lockDate) return next();

    // safeTable and safeColumn are from our internal whitelist only
    const rec = await query(
      `SELECT ${safeColumn} AS record_date FROM ${safeTable} WHERE id=$1`,
      [id]
    );
    if (!rec.rows.length) return next();

    const recDate = new Date(rec.rows[0].record_date);
    const lockDt  = new Date(lockDate);

    if (recDate <= lockDt) {
      return next(new AppError(
        `This record is in a locked period (≤ ${lockDate}) and cannot be modified.`,
        423
      ));
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { checkAuditLock, checkAuditLockForRecord };
