'use strict';
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { createExpenseVoucher } = require('../services/accountingEngine');
const { getPagination, paginatedResponse, toFloat, round2 } = require('../utils/helpers');

const listExpenses = asyncHandler(async (req, res) => {
  const bId = req.businessId;
  const { page, limit, offset } = getPagination(req);
  const { from, to, category } = req.query;
  let   where  = 'WHERE business_id=$1';
  const params = [bId];
  let   idx    = 2;
  if (from)     { where += ` AND expense_date>=$${idx++}`; params.push(from); }
  if (to)       { where += ` AND expense_date<=$${idx++}`; params.push(to); }
  if (category) { where += ` AND category=$${idx++}`;      params.push(category); }
  const countRes = await query(`SELECT COUNT(*) FROM expenses ${where}`, params);
  const result   = await query(
    `SELECT id, expense_date, category, description, amount, gst_amount, total_amount, payment_mode, created_at
     FROM expenses ${where} ORDER BY expense_date DESC LIMIT $${idx} OFFSET $${idx+1}`,
    [...params, limit, offset]
  );
  res.json(paginatedResponse(result.rows, parseInt(countRes.rows[0].count), page, limit));
});

const createExpense = asyncHandler(async (req, res) => {
  const {
    expenseDate, category, description, amount, gstAmount,
    paymentMode, expenseAccountId, payAccountId, reference,
  } = req.body;
  if (!expenseDate || !amount) throw new AppError('expenseDate and amount are required', 400);

  return withTransaction(async (client) => {
    const total = round2(toFloat(amount) + toFloat(gstAmount));
    const expRes = await client.query(
      `INSERT INTO expenses (business_id, expense_date, category, description,
         amount, gst_amount, total_amount, payment_mode,
         expense_account_id, pay_account_id, reference, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [req.businessId, expenseDate, category || 'General', description,
       toFloat(amount), toFloat(gstAmount), total, paymentMode || 'cash',
       expenseAccountId || null, payAccountId || null, reference || null, req.user.id]
    );
    const expense = expRes.rows[0];

    const voucherId = await createExpenseVoucher(client, req.businessId, req.user.id, {
      date:              expenseDate,
      expenseAccountId:  expenseAccountId  || null,
      expenseAccountCode: expenseAccountId ? null : '5032',
      amount:            total,
      cashBankAccountId: payAccountId || null,
      cashBankCode:      payAccountId ? null : (paymentMode === 'bank' ? '1002' : '1001'),
      narration:         description,
      reference,
    });

    await client.query('UPDATE expenses SET voucher_id=$1 WHERE id=$2', [voucherId, expense.id]);
    res.status(201).json({ expense: { ...expense, voucher_id: voucherId } });
  });
});

module.exports = { listExpenses, createExpense };
