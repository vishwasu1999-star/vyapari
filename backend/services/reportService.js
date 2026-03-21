'use strict';
/**
 * ============================================================
 *  PHASE 7 — REPORTS SERVICE
 *  Trial Balance | Profit & Loss | Balance Sheet |
 *  Day Book | GST Report | Account Ledger | Cash Book
 * ============================================================
 */
const { query } = require('../config/db');
const { toFloat, round2, getFinancialYear } = require('../utils/helpers');

// ============================================================
// TRIAL BALANCE
// Shows opening balance + period movements + closing balance
// Opening balance = account OB + all entries BEFORE startDate
// Period = entries from startDate to endDate
// ============================================================
const getTrialBalance = async (businessId, startDate, endDate) => {
  // Use subqueries to correctly separate pre-period and period entries
  const result = await query(
    `SELECT
       a.id,
       a.code,
       a.name,
       a.account_type,
       a.account_subtype,
       a.normal_balance,
       a.opening_balance         AS init_ob,
       a.opening_balance_type    AS init_ob_type,
       -- Pre-period entries (before startDate) — included in opening balance
       COALESCE(pre.pre_dr, 0)   AS pre_dr,
       COALESCE(pre.pre_cr, 0)   AS pre_cr,
       -- Period entries (startDate to endDate)
       COALESCE(per.period_dr, 0) AS period_dr,
       COALESCE(per.period_cr, 0) AS period_cr
     FROM accounts a
     -- Opening balance movements (before period start)
     LEFT JOIN (
       SELECT le.account_id,
              SUM(le.debit)  AS pre_dr,
              SUM(le.credit) AS pre_cr
       FROM ledger_entries le
       JOIN vouchers v ON v.id = le.voucher_id
         AND v.is_posted = TRUE
         AND v.voucher_date < $2
       WHERE le.business_id = $1
       GROUP BY le.account_id
     ) pre ON pre.account_id = a.id
     -- Period movements
     LEFT JOIN (
       SELECT le.account_id,
              SUM(le.debit)  AS period_dr,
              SUM(le.credit) AS period_cr
       FROM ledger_entries le
       JOIN vouchers v ON v.id = le.voucher_id
         AND v.is_posted = TRUE
         AND v.voucher_date BETWEEN $2 AND $3
       WHERE le.business_id = $1
       GROUP BY le.account_id
     ) per ON per.account_id = a.id
     WHERE a.business_id = $1
       AND a.is_active   = TRUE
       AND a.is_group    = FALSE
     ORDER BY a.code`,
    [businessId, startDate, endDate]
  );

  let totalDebit = 0, totalCredit = 0;

  const accounts = result.rows.map((row) => {
    // Opening balance = account's initial OB + all pre-period transactions
    const initObDr = row.init_ob_type === 'Dr' ? toFloat(row.init_ob) : 0;
    const initObCr = row.init_ob_type === 'Cr' ? toFloat(row.init_ob) : 0;

    const openingDr = round2(initObDr + toFloat(row.pre_dr));
    const openingCr = round2(initObCr + toFloat(row.pre_cr));

    // Net opening (Dr side positive, Cr side negative)
    const openingNet = round2(openingDr - openingCr);

    const periodDebit  = round2(toFloat(row.period_dr));
    const periodCredit = round2(toFloat(row.period_cr));

    // Closing = opening + period movements
    const closingNet = round2(openingNet + periodDebit - periodCredit);

    let closingDr = 0, closingCr = 0;
    if (closingNet >= 0) closingDr = closingNet;
    else                 closingCr = Math.abs(closingNet);

    totalDebit  = round2(totalDebit  + closingDr);
    totalCredit = round2(totalCredit + closingCr);

    return {
      id:           row.id,
      code:         row.code,
      name:         row.name,
      accountType:  row.account_type,
      subType:      row.account_subtype,
      openingDr:    openingNet >= 0 ? round2(openingNet) : 0,
      openingCr:    openingNet <  0 ? round2(Math.abs(openingNet)) : 0,
      periodDebit,
      periodCredit,
      closingDr,
      closingCr,
    };
  });

  return {
    accounts,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.02,
    startDate,
    endDate,
  };
};

// ============================================================
// PROFIT & LOSS STATEMENT
// Only uses INNER JOINs — period is strict
// ============================================================
const getProfitAndLoss = async (businessId, startDate, endDate) => {
  const result = await query(
    `SELECT
       a.id,
       a.code,
       a.name,
       a.account_type,
       a.account_subtype,
       COALESCE(SUM(le.debit),  0) AS total_debit,
       COALESCE(SUM(le.credit), 0) AS total_credit
     FROM accounts a
     JOIN ledger_entries le ON le.account_id = a.id
       AND le.business_id = $1
     JOIN vouchers v ON v.id = le.voucher_id
       AND v.is_posted      = TRUE
       AND v.voucher_date   BETWEEN $2 AND $3
     WHERE a.business_id = $1
       AND a.account_type IN ('Income', 'Expense')
       AND a.is_group       = FALSE
     GROUP BY a.id, a.code, a.name, a.account_type, a.account_subtype
     ORDER BY a.account_type DESC, a.code`,
    [businessId, startDate, endDate]
  );

  const income   = [];
  const expenses = [];

  for (const row of result.rows) {
    // Income accounts have normal Cr balance → net Cr = income
    // Expense accounts have normal Dr balance → net Dr = expense
    const entry = {
      id:      row.id,
      code:    row.code,
      name:    row.name,
      subType: row.account_subtype,
      debit:   round2(toFloat(row.total_debit)),
      credit:  round2(toFloat(row.total_credit)),
    };

    if (row.account_type === 'Income') {
      // Net income = credits - debits (returns are debits against income)
      entry.amount = round2(toFloat(row.total_credit) - toFloat(row.total_debit));
      income.push(entry);
    } else {
      // Net expense = debits - credits (purchase returns are credits against expense)
      entry.amount = round2(toFloat(row.total_debit) - toFloat(row.total_credit));
      expenses.push(entry);
    }
  }

  const totalIncome   = round2(income.reduce((s, a) => s + Math.max(a.amount, 0), 0));
  const totalExpenses = round2(expenses.reduce((s, a) => s + Math.max(a.amount, 0), 0));
  const cogsAmount    = expenses.find(e => e.code === '5001')?.amount || 0;
  const grossProfit   = round2(totalIncome - cogsAmount);
  const netProfit     = round2(totalIncome - totalExpenses);

  return {
    income,
    expenses,
    totalIncome,
    totalExpenses,
    grossProfit,
    netProfit,
    startDate,
    endDate,
  };
};

// ============================================================
// BALANCE SHEET
// All balances accumulated from inception to asOfDate
// ============================================================
const getBalanceSheet = async (businessId, asOfDate) => {
  const result = await query(
    `SELECT
       a.id,
       a.code,
       a.name,
       a.account_type,
       a.account_subtype,
       a.opening_balance,
       a.opening_balance_type,
       COALESCE(txn.total_dr, 0) AS total_dr,
       COALESCE(txn.total_cr, 0) AS total_cr
     FROM accounts a
     LEFT JOIN (
       SELECT le.account_id,
              SUM(le.debit)  AS total_dr,
              SUM(le.credit) AS total_cr
       FROM ledger_entries le
       JOIN vouchers v ON v.id = le.voucher_id
         AND v.is_posted    = TRUE
         AND v.voucher_date <= $2
       WHERE le.business_id = $1
       GROUP BY le.account_id
     ) txn ON txn.account_id = a.id
     WHERE a.business_id = $1
       AND a.account_type IN ('Asset', 'Liability', 'Equity')
       AND a.is_group    = FALSE
     ORDER BY a.account_type, a.code`,
    [businessId, asOfDate]
  );

  // Current period net profit (Income - Expenses up to asOfDate)
  const fy = getFinancialYear(new Date(asOfDate));
  const { netProfit } = await getProfitAndLoss(businessId, fy.start, asOfDate);

  const assets      = [];
  const liabilities = [];
  const equity      = [];

  for (const row of result.rows) {
    const obDr  = row.opening_balance_type === 'Dr' ? toFloat(row.opening_balance) : 0;
    const obCr  = row.opening_balance_type === 'Cr' ? toFloat(row.opening_balance) : 0;
    const netDr = round2(obDr + toFloat(row.total_dr));
    const netCr = round2(obCr + toFloat(row.total_cr));
    const bal   = round2(netDr - netCr);

    // Skip zero-balance accounts for cleaner output
    if (bal === 0) continue;

    const entry = {
      code:    row.code,
      name:    row.name,
      subType: row.account_subtype,
      balance: Math.abs(bal),
      side:    bal >= 0 ? 'Dr' : 'Cr',
    };

    if (row.account_type === 'Asset')     assets.push(entry);
    if (row.account_type === 'Liability') liabilities.push(entry);
    if (row.account_type === 'Equity')    equity.push(entry);
  }

  // Add current period P&L to equity (not yet closed to retained earnings)
  if (netProfit !== 0) {
    equity.push({
      code:    netProfit >= 0 ? 'NET_PROFIT' : 'NET_LOSS',
      name:    netProfit >= 0 ? 'Net Profit (Current Period)' : 'Net Loss (Current Period)',
      subType: 'Net Profit/Loss',
      balance: Math.abs(netProfit),
      side:    netProfit >= 0 ? 'Cr' : 'Dr',
    });
  }

  const sumSide  = (arr, side) => arr.filter(a => a.side === side).reduce((s, a) => s + a.balance, 0);

  const totalAssets  = round2(sumSide(assets, 'Dr') - sumSide(assets, 'Cr'));
  const totalLiab    = round2(sumSide(liabilities, 'Cr') - sumSide(liabilities, 'Dr'));
  const totalEquity  = round2(sumSide(equity, 'Cr') - sumSide(equity, 'Dr'));
  const totalLE      = round2(totalLiab + totalEquity);

  return {
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities: totalLiab,
    totalEquity,
    totalLE,
    netProfit,
    isBalanced: Math.abs(totalAssets - totalLE) < 0.10,
    asOfDate,
  };
};

// ============================================================
// DAY BOOK  (all vouchers for date range)
// ============================================================
const getDayBook = async (businessId, startDate, endDate) => {
  const result = await query(
    `SELECT
       v.id, v.voucher_type, v.voucher_number, v.voucher_date,
       v.narration, v.reference, v.total_debit, v.total_credit,
       json_agg(json_build_object(
         'accountName', le.account_name,
         'accountType', le.account_type,
         'debit',       le.debit,
         'credit',      le.credit,
         'narration',   le.narration
       ) ORDER BY le.sort_order) AS entries
     FROM vouchers v
     JOIN ledger_entries le ON le.voucher_id = v.id
     WHERE v.business_id = $1
       AND v.voucher_date BETWEEN $2 AND $3
       AND v.is_posted = TRUE
     GROUP BY v.id
     ORDER BY v.voucher_date ASC, v.created_at ASC`,
    [businessId, startDate, endDate]
  );

  return {
    vouchers:    result.rows,
    totalDebit:  round2(result.rows.reduce((s, v) => s + toFloat(v.total_debit),  0)),
    totalCredit: round2(result.rows.reduce((s, v) => s + toFloat(v.total_credit), 0)),
    startDate,
    endDate,
  };
};

// ============================================================
// ACCOUNT LEDGER  (running balance for one account)
// ============================================================
const getAccountLedger = async (businessId, accountId, startDate, endDate) => {
  // Opening balance before startDate
  const obResult = await query(
    `SELECT
       COALESCE(SUM(le.debit),  0) AS pre_debit,
       COALESCE(SUM(le.credit), 0) AS pre_credit
     FROM ledger_entries le
     JOIN vouchers v ON v.id = le.voucher_id
     WHERE le.account_id  = $1
       AND le.business_id = $2
       AND le.entry_date  < $3
       AND v.is_posted    = TRUE`,
    [accountId, businessId, startDate]
  );

  const accRes = await query(
    'SELECT opening_balance, opening_balance_type, name, code, account_type FROM accounts WHERE id=$1 AND business_id=$2',
    [accountId, businessId]
  );
  if (!accRes.rows.length) throw new Error('Account not found');
  const acc = accRes.rows[0];

  const initObDr = acc.opening_balance_type === 'Dr' ? toFloat(acc.opening_balance) : 0;
  const initObCr = acc.opening_balance_type === 'Cr' ? toFloat(acc.opening_balance) : 0;
  const preDr    = initObDr + toFloat(obResult.rows[0].pre_debit);
  const preCr    = initObCr + toFloat(obResult.rows[0].pre_credit);
  const openingBalance = round2(preDr - preCr);

  // Period entries
  const result = await query(
    `SELECT
       le.entry_date AS date,
       v.voucher_type,
       v.voucher_number,
       v.narration  AS voucher_narration,
       le.narration AS entry_narration,
       le.debit,
       le.credit,
       p.name       AS party_name
     FROM ledger_entries le
     JOIN vouchers v ON v.id = le.voucher_id
     LEFT JOIN parties p ON p.id = le.party_id
     WHERE le.account_id  = $1
       AND le.business_id = $2
       AND le.entry_date  BETWEEN $3 AND $4
       AND v.is_posted    = TRUE
     ORDER BY le.entry_date ASC, le.sort_order ASC`,
    [accountId, businessId, startDate, endDate]
  );

  let running = openingBalance;
  const entries = result.rows.map((row) => {
    running = round2(running + toFloat(row.debit) - toFloat(row.credit));
    return {
      date:        row.date,
      voucherType: row.voucher_type,
      voucherNum:  row.voucher_number,
      narration:   row.entry_narration || row.voucher_narration,
      partyName:   row.party_name,
      debit:       round2(toFloat(row.debit)),
      credit:      round2(toFloat(row.credit)),
      balance:     Math.abs(running),
      balanceSide: running >= 0 ? 'Dr' : 'Cr',
    };
  });

  const totDebit  = round2(entries.reduce((s, e) => s + e.debit,  0));
  const totCredit = round2(entries.reduce((s, e) => s + e.credit, 0));
  const closing   = round2(openingBalance + totDebit - totCredit);

  return {
    account:        { id: accountId, name: acc.name, code: acc.code, type: acc.account_type },
    openingBalance,
    openingBalanceSide: openingBalance >= 0 ? 'Dr' : 'Cr',
    entries,
    totalDebit:     totDebit,
    totalCredit:    totCredit,
    closingBalance: Math.abs(closing),
    closingBalanceSide: closing >= 0 ? 'Dr' : 'Cr',
    startDate,
    endDate,
  };
};

// ============================================================
// GST REPORT (GSTR-1 / GSTR-3B summary)
// ============================================================
const getGSTReport = async (businessId, startDate, endDate) => {
  // Output tax (on sales)
  const outputRes = await query(
    `SELECT
       i.is_inter_state,
       ii.gst_rate,
       COUNT(DISTINCT i.id) AS invoice_count,
       SUM(ii.taxable_amount) AS taxable_amount,
       SUM(ii.cgst_amount)    AS cgst,
       SUM(ii.sgst_amount)    AS sgst,
       SUM(ii.igst_amount)    AS igst,
       SUM(ii.cess_amount)    AS cess
     FROM invoices i
     JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.business_id = $1
       AND i.invoice_type = 'sale'
       AND i.status NOT IN ('cancelled', 'draft')
       AND i.invoice_date BETWEEN $2 AND $3
     GROUP BY i.is_inter_state, ii.gst_rate
     ORDER BY ii.gst_rate`,
    [businessId, startDate, endDate]
  );

  // Input tax (on purchases)
  const inputRes = await query(
    `SELECT
       ii.gst_rate,
       COUNT(DISTINCT i.id) AS invoice_count,
       SUM(ii.taxable_amount) AS taxable_amount,
       SUM(ii.cgst_amount)    AS cgst,
       SUM(ii.sgst_amount)    AS sgst,
       SUM(ii.igst_amount)    AS igst,
       SUM(ii.cess_amount)    AS cess
     FROM invoices i
     JOIN invoice_items ii ON ii.invoice_id = i.id
     WHERE i.business_id = $1
       AND i.invoice_type = 'purchase'
       AND i.status NOT IN ('cancelled', 'draft')
       AND i.invoice_date BETWEEN $2 AND $3
     GROUP BY ii.gst_rate
     ORDER BY ii.gst_rate`,
    [businessId, startDate, endDate]
  );

  const toNum = (v) => round2(toFloat(v));

  const outputGST = outputRes.rows.map(r => ({
    isInterState: r.is_inter_state,
    gstRate:      toFloat(r.gst_rate),
    invoiceCount: parseInt(r.invoice_count),
    taxableAmount: toNum(r.taxable_amount),
    cgst: toNum(r.cgst), sgst: toNum(r.sgst),
    igst: toNum(r.igst), cess: toNum(r.cess),
    totalTax: toNum(toFloat(r.cgst) + toFloat(r.sgst) + toFloat(r.igst) + toFloat(r.cess)),
  }));

  const inputGST = inputRes.rows.map(r => ({
    gstRate:      toFloat(r.gst_rate),
    invoiceCount: parseInt(r.invoice_count),
    taxableAmount: toNum(r.taxable_amount),
    cgst: toNum(r.cgst), sgst: toNum(r.sgst),
    igst: toNum(r.igst), cess: toNum(r.cess),
    totalTax: toNum(toFloat(r.cgst) + toFloat(r.sgst) + toFloat(r.igst) + toFloat(r.cess)),
  }));

  const sumField = (arr, f) => round2(arr.reduce((s, r) => s + (r[f] || 0), 0));

  const totOutput = {
    taxableAmount: sumField(outputGST, 'taxableAmount'),
    cgst: sumField(outputGST, 'cgst'), sgst: sumField(outputGST, 'sgst'),
    igst: sumField(outputGST, 'igst'), cess: sumField(outputGST, 'cess'),
    totalTax: sumField(outputGST, 'totalTax'),
  };
  const totInput = {
    taxableAmount: sumField(inputGST, 'taxableAmount'),
    cgst: sumField(inputGST, 'cgst'), sgst: sumField(inputGST, 'sgst'),
    igst: sumField(inputGST, 'igst'), cess: sumField(inputGST, 'cess'),
    totalTax: sumField(inputGST, 'totalTax'),
  };
  const netPayable = {
    cgst:  round2(totOutput.cgst  - totInput.cgst),
    sgst:  round2(totOutput.sgst  - totInput.sgst),
    igst:  round2(totOutput.igst  - totInput.igst),
    cess:  round2(totOutput.cess  - totInput.cess),
    total: round2(totOutput.totalTax - totInput.totalTax),
  };

  return { outputGST, inputGST, totOutput, totInput, netPayable, startDate, endDate };
};

// ============================================================
// CASH BOOK  (Cash in Hand + Bank account entries)
// ============================================================
const getCashBook = async (businessId, accountCode, startDate, endDate) => {
  // Find account by code
  const accRes = await query(
    'SELECT id FROM accounts WHERE business_id=$1 AND code=$2',
    [businessId, accountCode]
  );
  if (!accRes.rows.length) throw new Error(`Account ${accountCode} not found`);
  return getAccountLedger(businessId, accRes.rows[0].id, startDate, endDate);
};

module.exports = {
  getTrialBalance,
  getProfitAndLoss,
  getBalanceSheet,
  getDayBook,
  getAccountLedger,
  getGSTReport,
  getCashBook,
};
