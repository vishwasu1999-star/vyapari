'use strict';
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { getFinancialYear, toDateStr } = require('../utils/helpers');
const {
  getTrialBalance, getProfitAndLoss, getBalanceSheet,
  getDayBook, getAccountLedger, getGSTReport, getCashBook,
} = require('../services/reportService');

// Helper: get date range from query or default to current FY
const getDateRange = (req) => {
  const fy   = getFinancialYear();
  const from = req.query.from || fy.start;
  const to   = req.query.to   || toDateStr(new Date());
  return { from, to };
};

// ============================================================
// GET /reports/trial-balance
// ============================================================
const trialBalance = asyncHandler(async (req, res) => {
  const { from, to } = getDateRange(req);
  const data = await getTrialBalance(req.businessId, from, to);
  res.json(data);
});

// ============================================================
// GET /reports/profit-loss
// ============================================================
const profitLoss = asyncHandler(async (req, res) => {
  const { from, to } = getDateRange(req);
  const data = await getProfitAndLoss(req.businessId, from, to);
  res.json(data);
});

// ============================================================
// GET /reports/balance-sheet
// ============================================================
const balanceSheet = asyncHandler(async (req, res) => {
  const asOf = req.query.asOf || toDateStr(new Date());
  const data = await getBalanceSheet(req.businessId, asOf);
  res.json(data);
});

// ============================================================
// GET /reports/day-book
// ============================================================
const dayBook = asyncHandler(async (req, res) => {
  const { from, to } = getDateRange(req);
  const data = await getDayBook(req.businessId, from, to);
  res.json(data);
});

// ============================================================
// GET /reports/account-ledger/:accountId
// ============================================================
const accountLedger = asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  if (!accountId) throw new AppError('accountId is required', 400);
  const { from, to } = getDateRange(req);
  const data = await getAccountLedger(req.businessId, accountId, from, to);
  res.json(data);
});

// ============================================================
// GET /reports/gst
// ============================================================
const gstReport = asyncHandler(async (req, res) => {
  const { from, to } = getDateRange(req);
  const data = await getGSTReport(req.businessId, from, to);
  res.json(data);
});

// ============================================================
// GET /reports/cash-book
// ============================================================
const cashBook = asyncHandler(async (req, res) => {
  const { from, to } = getDateRange(req);
  const { account = '1001' } = req.query; // default: Cash in Hand
  const data = await getCashBook(req.businessId, account, from, to);
  res.json(data);
});

// ============================================================
// GET /reports/dashboard
// Summary stats for the dashboard screen
// ============================================================
const dashboard = asyncHandler(async (req, res) => {
  const bId = req.businessId;
  const fy  = getFinancialYear();
  const now = toDateStr(new Date());

  const [
    salesThisMonth, purchasesThisMonth,
    receivables, payables,
    recentSales, lowStock, monthlySales,
    overdueInvoices,
  ] = await Promise.all([
    // Sales this month
    require('../config/db').query(
      `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count
       FROM invoices
       WHERE business_id=$1 AND invoice_type='sale'
         AND status != 'cancelled'
         AND date_trunc('month', invoice_date) = date_trunc('month', CURRENT_DATE)`, [bId]
    ),
    // Purchases this month
    require('../config/db').query(
      `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count
       FROM invoices
       WHERE business_id=$1 AND invoice_type='purchase'
         AND status != 'cancelled'
         AND date_trunc('month', invoice_date) = date_trunc('month', CURRENT_DATE)`, [bId]
    ),
    // Total receivables (unpaid sale invoices)
    require('../config/db').query(
      `SELECT COALESCE(SUM(balance_due),0) AS total, COUNT(*) AS count
       FROM invoices
       WHERE business_id=$1 AND invoice_type='sale' AND status IN ('unpaid','partial')`, [bId]
    ),
    // Total payables (unpaid purchase invoices)
    require('../config/db').query(
      `SELECT COALESCE(SUM(balance_due),0) AS total, COUNT(*) AS count
       FROM invoices
       WHERE business_id=$1 AND invoice_type='purchase' AND status IN ('unpaid','partial')`, [bId]
    ),
    // Recent 5 sale invoices
    require('../config/db').query(
      `SELECT id, invoice_number, invoice_date, party_name, total_amount, status
       FROM invoices
       WHERE business_id=$1 AND invoice_type='sale'
       ORDER BY created_at DESC LIMIT 5`, [bId]
    ),
    // Low stock items
    require('../config/db').query(
      `SELECT id, name, current_stock, min_stock_alert, unit
       FROM items
       WHERE business_id=$1 AND track_inventory=TRUE
         AND current_stock <= min_stock_alert AND min_stock_alert > 0
       ORDER BY current_stock ASC LIMIT 5`, [bId]
    ),
    // Monthly sales last 6 months
    require('../config/db').query(
      `SELECT
         TO_CHAR(date_trunc('month', invoice_date), 'Mon YYYY') AS month,
         date_trunc('month', invoice_date) AS month_start,
         COALESCE(SUM(total_amount), 0) AS sales,
         COALESCE(SUM(total_tax),   0) AS tax
       FROM invoices
       WHERE business_id=$1 AND invoice_type='sale' AND status != 'cancelled'
         AND invoice_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
       GROUP BY date_trunc('month', invoice_date)
       ORDER BY month_start ASC`, [bId]
    ),
    // Overdue invoices
    require('../config/db').query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(balance_due),0) AS total
       FROM invoices
       WHERE business_id=$1 AND invoice_type='sale'
         AND status IN ('unpaid','partial') AND due_date < CURRENT_DATE`, [bId]
    ),
  ]);

  res.json({
    salesThisMonth:    { total: parseFloat(salesThisMonth.rows[0].total),    count: parseInt(salesThisMonth.rows[0].count) },
    purchasesThisMonth:{ total: parseFloat(purchasesThisMonth.rows[0].total), count: parseInt(purchasesThisMonth.rows[0].count) },
    receivables:       { total: parseFloat(receivables.rows[0].total),       count: parseInt(receivables.rows[0].count) },
    payables:          { total: parseFloat(payables.rows[0].total),          count: parseInt(payables.rows[0].count) },
    overdueInvoices:   { total: parseFloat(overdueInvoices.rows[0].total),   count: parseInt(overdueInvoices.rows[0].count) },
    recentSales:       recentSales.rows,
    lowStock:          lowStock.rows,
    monthlySales:      monthlySales.rows,
  });
});

module.exports = {
  trialBalance, profitLoss, balanceSheet,
  dayBook, accountLedger, gstReport, cashBook, dashboard,
};
