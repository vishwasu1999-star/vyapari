'use strict';
/**
 * ============================================================
 *  VYAPARI — DOUBLE-ENTRY ACCOUNTING ENGINE
 * ============================================================
 *  Every financial transaction creates a balanced voucher:
 *    SUM(debits) === SUM(credits)
 *
 *  Standard accounting equation:
 *    Assets = Liabilities + Equity
 *
 *  Normal balances:
 *    Assets    → Debit  increases, Credit decreases
 *    Liabilities → Credit increases, Debit decreases
 *    Equity    → Credit increases, Debit decreases
 *    Revenue   → Credit increases, Debit decreases
 *    Expense   → Debit  increases, Credit decreases
 * ============================================================
 */

const { query, withTransaction } = require('../config/db');
const { ACCOUNT_CODES, VOUCHER_TYPES } = require('../config/constants');
const { toFloat, round2 } = require('../utils/helpers');
const logger              = require('../config/logger');

// ============================================================
// INTERNAL HELPERS
// ============================================================

/**
 * Look up account ID by its code for a specific business.
 * Throws if not found (system accounts must always exist after seed).
 */
const getAccountIdByCode = async (client, businessId, code) => {
  const result = await client.query(
    'SELECT id, name FROM accounts WHERE business_id=$1 AND code=$2 AND is_active=TRUE',
    [businessId, code]
  );
  if (!result.rows.length) {
    throw new Error(`Account with code '${code}' not found for business ${businessId}`);
  }
  return result.rows[0];
};

// ============================================================
// CORE: CREATE VOUCHER + LEDGER ENTRIES
// This is the single source of truth for all accounting writes.
// ============================================================
/**
 * @param {object} client   - pg transaction client
 * @param {string} businessId
 * @param {string} userId
 * @param {object} options
 *   @param {string}  options.voucherType  - VOUCHER_TYPES.*
 *   @param {Date|string} options.date
 *   @param {string}  options.narration
 *   @param {string}  [options.reference]
 *   @param {string}  [options.invoiceId]
 *   @param {string}  [options.paymentId]
 *   @param {Array}   options.entries
 *     Each entry: { accountId, accountCode, debit, credit, narration, partyId, invoiceId }
 *     Provide either accountId OR accountCode; engine resolves both.
 * @returns {string} voucherId
 */
const createVoucher = async (client, businessId, userId, options) => {
  const {
    voucherType, date, narration, reference,
    invoiceId = null, paymentId = null,
    entries,
  } = options;

  if (!entries || entries.length < 2) {
    throw new Error('A voucher must have at least two ledger entries');
  }

  // ── Resolve account IDs for entries that supply only a code ──
  const resolvedEntries = [];
  for (const entry of entries) {
    let accountId   = entry.accountId;
    let accountName = entry.accountName || '';
    let accountType = entry.accountType || '';

    if (!accountId && entry.accountCode) {
      const acc = await getAccountIdByCode(client, businessId, entry.accountCode);
      accountId   = acc.id;
      accountName = acc.name;
    } else if (accountId && !accountName) {
      const acc = await client.query('SELECT name, account_type FROM accounts WHERE id=$1', [accountId]);
      if (acc.rows.length) {
        accountName = acc.rows[0].name;
        accountType = acc.rows[0].account_type;
      }
    }

    if (!accountId) throw new Error('Each entry must provide accountId or accountCode');

    resolvedEntries.push({
      accountId,
      accountName,
      accountType,
      debit:     round2(toFloat(entry.debit)),
      credit:    round2(toFloat(entry.credit)),
      narration: entry.narration || narration || null,
      partyId:   entry.partyId   || null,
      invoiceId: entry.invoiceId || invoiceId || null,
      sortOrder: entry.sortOrder || 0,
    });
  }

  // ── Validate balance ─────────────────────────────────────────
  const totalDebit  = round2(resolvedEntries.reduce((s, e) => s + e.debit,  0));
  const totalCredit = round2(resolvedEntries.reduce((s, e) => s + e.credit, 0));

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Voucher is NOT balanced: Debit=${totalDebit.toFixed(2)} Credit=${totalCredit.toFixed(2)}`
    );
  }

  // ── Generate voucher number ───────────────────────────────────
  const numResult = await client.query(
    'SELECT fn_next_invoice_number($1,$2) AS number',
    [businessId, 'voucher']
  );
  const voucherNumber = numResult.rows[0].number;

  // ── Insert voucher header ─────────────────────────────────────
  const vResult = await client.query(
    `INSERT INTO vouchers
       (business_id, voucher_type, voucher_number, voucher_date,
        narration, reference, total_debit, total_credit, is_balanced,
        invoice_id, payment_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      businessId, voucherType, voucherNumber, date,
      narration, reference || null, totalDebit, totalCredit, true,
      invoiceId, paymentId, userId,
    ]
  );
  const voucherId = vResult.rows[0].id;

  // ── Insert ledger entries ─────────────────────────────────────
  for (let i = 0; i < resolvedEntries.length; i++) {
    const e = resolvedEntries[i];
    await client.query(
      `INSERT INTO ledger_entries
         (voucher_id, business_id, account_id, account_name, account_type,
          debit, credit, narration, party_id, invoice_id, sort_order, entry_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        voucherId, businessId, e.accountId, e.accountName, e.accountType,
        e.debit, e.credit,
        e.narration, e.partyId, e.invoiceId,
        i, date,
      ]
    );
  }

  logger.debug(`Voucher created: ${voucherNumber} (${voucherType}) — Dr=${totalDebit} Cr=${totalCredit}`);
  return voucherId;
};

// ============================================================
// SALE VOUCHER
// ─────────────────────────────────────────────────────────────
// Dr  Accounts Receivable (or Party)    →  total_amount
// Cr  Sales Revenue                     →  taxable_amount + other_charges
// Cr  CGST Output  (intra-state)        →  cgst_amount
// Cr  SGST Output  (intra-state)        →  sgst_amount
//  OR
// Cr  IGST Output  (inter-state)        →  igst_amount
// Cr/Dr Round Off Account               →  round_off (if any)
//
// NOTE: round_off is credited when total is rounded UP (Dr < Cr sum)
//       round_off is debited  when total is rounded DOWN (Dr > Cr sum)
// ============================================================
const createSaleVoucher = async (client, businessId, userId, invoice, partyAccountId) => {
  const receivableCode = partyAccountId ? null : ACCOUNT_CODES.ACCOUNTS_RECEIVABLE;
  const taxable        = round2(toFloat(invoice.taxable_amount));
  const cgst           = round2(toFloat(invoice.cgst_amount));
  const sgst           = round2(toFloat(invoice.sgst_amount));
  const igst           = round2(toFloat(invoice.igst_amount));
  const cess           = round2(toFloat(invoice.cess_amount));
  const otherCharges   = round2(toFloat(invoice.other_charges));
  const roundOff       = round2(toFloat(invoice.round_off));  // can be positive or negative
  const total          = round2(toFloat(invoice.total_amount));

  const entries = [];

  // DEBIT: Receivable (full invoice total including round_off)
  entries.push({
    accountId:   partyAccountId || null,
    accountCode: receivableCode,
    debit:       total,
    credit:      0,
    narration:   `Sale to ${invoice.party_name} — ${invoice.invoice_number}`,
    partyId:     invoice.party_id || null,
    invoiceId:   invoice.id,
  });

  // CREDIT: Sales Revenue (taxable amount + other charges)
  const salesCredit = round2(taxable + otherCharges);
  entries.push({
    accountCode: ACCOUNT_CODES.SALES_REVENUE,
    debit:       0,
    credit:      salesCredit,
    narration:   `Sales — ${invoice.invoice_number}`,
    invoiceId:   invoice.id,
  });

  // CREDIT: GST (split by type)
  if (invoice.is_inter_state) {
    if (igst > 0) {
      entries.push({ accountCode: ACCOUNT_CODES.IGST_OUTPUT, debit: 0, credit: igst,
        narration: `IGST on sale — ${invoice.invoice_number}` });
    }
  } else {
    if (cgst > 0) {
      entries.push({ accountCode: ACCOUNT_CODES.CGST_OUTPUT, debit: 0, credit: cgst,
        narration: `CGST on sale — ${invoice.invoice_number}` });
    }
    if (sgst > 0) {
      entries.push({ accountCode: ACCOUNT_CODES.SGST_OUTPUT, debit: 0, credit: sgst,
        narration: `SGST on sale — ${invoice.invoice_number}` });
    }
  }
  if (cess > 0) {
    entries.push({ accountCode: ACCOUNT_CODES.GST_OUTPUT, debit: 0, credit: cess,
      narration: `Cess on sale — ${invoice.invoice_number}` });
  }

  // ROUND OFF: balance the voucher if total was rounded
  // roundOff = rounded_total - raw_total
  // If roundOff > 0: total rounded UP → we received more → Cr Round Off (income)
  // If roundOff < 0: total rounded DOWN → we received less → Dr Round Off (expense)
  if (Math.abs(roundOff) > 0) {
    if (roundOff > 0) {
      // Rounded up: extra credit needed
      entries.push({ accountCode: ACCOUNT_CODES.ROUND_OFF, debit: 0, credit: roundOff,
        narration: `Round off — ${invoice.invoice_number}` });
    } else {
      // Rounded down: extra debit needed to absorb the difference
      entries.push({ accountCode: ACCOUNT_CODES.ROUND_OFF, debit: Math.abs(roundOff), credit: 0,
        narration: `Round off — ${invoice.invoice_number}` });
    }
  }

  return createVoucher(client, businessId, userId, {
    voucherType: VOUCHER_TYPES.SALES,
    date:        invoice.invoice_date,
    narration:   `Sale Invoice ${invoice.invoice_number} — ${invoice.party_name}`,
    reference:   invoice.invoice_number,
    invoiceId:   invoice.id,
    entries,
  });
};

// ============================================================
// PURCHASE VOUCHER
// ─────────────────────────────────────────────────────────────
// Dr  COGS / Stock                      →  taxable_amount + other_charges
// Dr  CGST Input  (intra-state)         →  cgst_amount
// Dr  SGST Input  (intra-state)         →  sgst_amount
//  OR
// Dr  IGST Input  (inter-state)         →  igst_amount
// Cr  Accounts Payable (or Supplier)    →  total_amount
// Cr/Dr Round Off Account               →  round_off (if any)
// ============================================================
const createPurchaseVoucher = async (client, businessId, userId, invoice, partyAccountId) => {
  const payableCode = partyAccountId ? null : ACCOUNT_CODES.ACCOUNTS_PAYABLE;
  const taxable     = round2(toFloat(invoice.taxable_amount));
  const cgst        = round2(toFloat(invoice.cgst_amount));
  const sgst        = round2(toFloat(invoice.sgst_amount));
  const igst        = round2(toFloat(invoice.igst_amount));
  const cess        = round2(toFloat(invoice.cess_amount));
  const otherCharges = round2(toFloat(invoice.other_charges));
  const roundOff    = round2(toFloat(invoice.round_off));
  const total       = round2(toFloat(invoice.total_amount));

  const entries = [];

  // DEBIT: COGS (taxable + other charges = total cost before tax)
  const cogsDebit = round2(taxable + otherCharges);
  entries.push({
    accountCode: ACCOUNT_CODES.COGS,
    debit:       cogsDebit,
    credit:      0,
    narration:   `Purchase from ${invoice.party_name} — ${invoice.invoice_number}`,
    invoiceId:   invoice.id,
  });

  // DEBIT: GST Input Credit
  if (invoice.is_inter_state) {
    if (igst > 0) {
      entries.push({ accountCode: ACCOUNT_CODES.IGST_INPUT, debit: igst, credit: 0,
        narration: `IGST Input — ${invoice.invoice_number}` });
    }
  } else {
    if (cgst > 0) {
      entries.push({ accountCode: ACCOUNT_CODES.CGST_INPUT, debit: cgst, credit: 0,
        narration: `CGST Input — ${invoice.invoice_number}` });
    }
    if (sgst > 0) {
      entries.push({ accountCode: ACCOUNT_CODES.SGST_INPUT, debit: sgst, credit: 0,
        narration: `SGST Input — ${invoice.invoice_number}` });
    }
  }
  if (cess > 0) {
    entries.push({ accountCode: ACCOUNT_CODES.GST_INPUT, debit: cess, credit: 0,
      narration: `Cess Input — ${invoice.invoice_number}` });
  }

  // ROUND OFF (purchase round-off is opposite: rounded UP → we pay more → Dr Round Off)
  if (Math.abs(roundOff) > 0) {
    if (roundOff > 0) {
      // Rounded up: we pay slightly more → extra debit
      entries.push({ accountCode: ACCOUNT_CODES.ROUND_OFF, debit: roundOff, credit: 0,
        narration: `Round off — ${invoice.invoice_number}` });
    } else {
      // Rounded down: we pay slightly less → extra credit
      entries.push({ accountCode: ACCOUNT_CODES.ROUND_OFF, debit: 0, credit: Math.abs(roundOff),
        narration: `Round off — ${invoice.invoice_number}` });
    }
  }

  // CREDIT: Payable (full invoice total)
  entries.push({
    accountId:   partyAccountId || null,
    accountCode: payableCode,
    debit:       0,
    credit:      total,
    narration:   `Payable — ${invoice.invoice_number}`,
    partyId:     invoice.party_id || null,
    invoiceId:   invoice.id,
  });

  return createVoucher(client, businessId, userId, {
    voucherType: VOUCHER_TYPES.PURCHASE,
    date:        invoice.invoice_date,
    narration:   `Purchase Invoice ${invoice.invoice_number} — ${invoice.party_name}`,
    reference:   invoice.invoice_number,
    invoiceId:   invoice.id,
    entries,
  });
};

// ============================================================
// RECEIPT VOUCHER  (Customer pays us)
// Dr  Cash / Bank
// Cr  Accounts Receivable / Party Account
// ============================================================
const createReceiptVoucher = async (client, businessId, userId, {
  date, partyAccountId, partyName, partyId, amount,
  cashBankAccountId, cashBankCode, reference, narration, paymentId,
}) => {
  return createVoucher(client, businessId, userId, {
    voucherType: VOUCHER_TYPES.RECEIPT,
    date,
    narration:   narration || `Receipt from ${partyName}`,
    reference,
    paymentId,
    entries: [
      {
        accountId:   cashBankAccountId || null,
        accountCode: cashBankCode || ACCOUNT_CODES.CASH,
        debit:       round2(amount),
        credit:      0,
        narration:   `Received from ${partyName}`,
      },
      {
        accountId:   partyAccountId || null,
        accountCode: partyAccountId ? null : ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
        debit:       0,
        credit:      round2(amount),
        narration:   `Receipt — ${reference || ''}`,
        partyId,
      },
    ],
  });
};

// ============================================================
// PAYMENT VOUCHER  (We pay supplier)
// Dr  Accounts Payable / Party Account
// Cr  Cash / Bank
// ============================================================
const createPaymentVoucher = async (client, businessId, userId, {
  date, partyAccountId, partyName, partyId, amount,
  cashBankAccountId, cashBankCode, reference, narration, paymentId,
}) => {
  return createVoucher(client, businessId, userId, {
    voucherType: VOUCHER_TYPES.PAYMENT,
    date,
    narration:   narration || `Payment to ${partyName}`,
    reference,
    paymentId,
    entries: [
      {
        accountId:   partyAccountId || null,
        accountCode: partyAccountId ? null : ACCOUNT_CODES.ACCOUNTS_PAYABLE,
        debit:       round2(amount),
        credit:      0,
        narration:   `Payment to ${partyName}`,
        partyId,
      },
      {
        accountId:   cashBankAccountId || null,
        accountCode: cashBankCode || ACCOUNT_CODES.CASH,
        debit:       0,
        credit:      round2(amount),
        narration:   `Paid — ${reference || ''}`,
      },
    ],
  });
};

// ============================================================
// EXPENSE VOUCHER
// Dr  Expense Account
// Cr  Cash / Bank
// ============================================================
const createExpenseVoucher = async (client, businessId, userId, {
  date, expenseAccountId, expenseAccountCode,
  amount, cashBankAccountId, cashBankCode,
  narration, reference,
}) => {
  return createVoucher(client, businessId, userId, {
    voucherType: VOUCHER_TYPES.JOURNAL,
    date,
    narration,
    reference,
    entries: [
      {
        accountId:   expenseAccountId || null,
        accountCode: expenseAccountCode || ACCOUNT_CODES.MISC_EXPENSE,
        debit:       round2(amount),
        credit:      0,
        narration,
      },
      {
        accountId:   cashBankAccountId || null,
        accountCode: cashBankCode || ACCOUNT_CODES.CASH,
        debit:       0,
        credit:      round2(amount),
        narration,
      },
    ],
  });
};

// ============================================================
// CONTRA VOUCHER  (Cash ↔ Bank transfer)
// Dr  Destination Account
// Cr  Source Account
// ============================================================
const createContraVoucher = async (client, businessId, userId, {
  date, fromAccountId, toAccountId, amount, narration,
}) => {
  return createVoucher(client, businessId, userId, {
    voucherType: VOUCHER_TYPES.CONTRA,
    date,
    narration: narration || 'Fund transfer',
    entries: [
      { accountId: toAccountId,   debit: round2(amount), credit: 0            },
      { accountId: fromAccountId, debit: 0,              credit: round2(amount) },
    ],
  });
};

// ============================================================
// GET ACCOUNT BALANCE
// Returns debit total, credit total and net balance for an account
// ============================================================
const getAccountBalance = async (businessId, accountId, asOfDate = null) => {
  // Build the ledger entries filter conditionally
  const params = [accountId, businessId];
  let dateFilter = '';
  if (asOfDate) {
    params.push(asOfDate);
    dateFilter = `AND le.entry_date <= $${params.length}`;
  }

  const sql = `
    SELECT
      a.opening_balance,
      a.opening_balance_type,
      a.normal_balance,
      COALESCE(SUM(le.debit),  0) AS period_debit,
      COALESCE(SUM(le.credit), 0) AS period_credit
    FROM accounts a
    LEFT JOIN ledger_entries le ON le.account_id = a.id
      AND le.business_id = $2
      ${dateFilter}
    LEFT JOIN vouchers v ON v.id = le.voucher_id AND v.is_posted = TRUE
    WHERE a.id = $1 AND a.business_id = $2
    GROUP BY a.id, a.opening_balance, a.opening_balance_type, a.normal_balance`;

  const result = await query(sql, params);
  if (!result.rows.length) return { debit: 0, credit: 0, net: 0, side: 'Dr', absNet: 0 };

  const row    = result.rows[0];
  const obDr   = row.opening_balance_type === 'Dr' ? toFloat(row.opening_balance) : 0;
  const obCr   = row.opening_balance_type === 'Cr' ? toFloat(row.opening_balance) : 0;
  const debit  = round2(obDr + toFloat(row.period_debit));
  const credit = round2(obCr + toFloat(row.period_credit));
  const net    = round2(debit - credit);

  return { debit, credit, net, side: net >= 0 ? 'Dr' : 'Cr', absNet: Math.abs(net) };
};

// ============================================================
// REVERSE VOUCHER (for cancellations)
// Creates an equal-and-opposite voucher to undo the original
// ============================================================
const reverseVoucher = async (client, businessId, userId, originalVoucherId, date, reason) => {
  const vResult = await client.query(
    'SELECT * FROM vouchers WHERE id=$1 AND business_id=$2',
    [originalVoucherId, businessId]
  );
  if (!vResult.rows.length) throw new Error(`Voucher ${originalVoucherId} not found`);

  const entries = await client.query(
    'SELECT * FROM ledger_entries WHERE voucher_id=$1 ORDER BY sort_order',
    [originalVoucherId]
  );

  // Reverse every entry: debit ↔ credit
  const reversedEntries = entries.rows.map(e => ({
    accountId:  e.account_id,
    debit:      toFloat(e.credit),   // swap
    credit:     toFloat(e.debit),    // swap
    narration:  e.narration,
    partyId:    e.party_id,
    invoiceId:  e.invoice_id,
  }));

  const original = vResult.rows[0];

  return createVoucher(client, businessId, userId, {
    voucherType: original.voucher_type,
    date:        date || original.voucher_date,
    narration:   `REVERSAL: ${original.narration || original.voucher_number}${reason ? ` — ${reason}` : ''}`,
    reference:   `REV-${original.voucher_number}`,
    entries:     reversedEntries,
  });
};


module.exports = {
  createVoucher,
  createSaleVoucher,
  createPurchaseVoucher,
  createReceiptVoucher,
  createPaymentVoucher,
  createExpenseVoucher,
  createContraVoucher,
  getAccountBalance,
  reverseVoucher,
};
