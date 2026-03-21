'use strict';
const { query } = require('../config/db');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { getPagination, paginatedResponse } = require('../utils/helpers');

const listAccounts = asyncHandler(async (req, res) => {
  const bId  = req.businessId;
  const { type, isGroup, search } = req.query;
  let   where  = 'WHERE business_id=$1 AND is_active=TRUE';
  const params = [bId];
  let   idx    = 2;
  if (type)    { where += ` AND account_type=$${idx++}`;  params.push(type); }
  if (isGroup !== undefined) { where += ` AND is_group=$${idx++}`; params.push(isGroup === 'true'); }
  if (search)  { where += ` AND name ILIKE $${idx++}`;   params.push(`%${search}%`); }

  const result = await query(
    `SELECT id, code, name, account_type, account_subtype, normal_balance,
            opening_balance, opening_balance_type, is_system, is_group,
            bank_name, account_number
     FROM accounts ${where} ORDER BY code`,
    params
  );
  res.json({ accounts: result.rows });
});

const getAccount = asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM accounts WHERE id=$1 AND business_id=$2',
    [req.params.id, req.businessId]
  );
  if (!result.rows.length) throw new AppError('Account not found', 404);
  res.json({ account: result.rows[0] });
});

const createAccount = asyncHandler(async (req, res) => {
  const { code, name, accountType, accountSubtype, normalBalance,
          openingBalance, openingBalanceType, parentId, bankName,
          accountNumber, ifscCode, description } = req.body;
  if (!name || !accountType) throw new AppError('name and accountType are required', 400);

  const result = await query(
    `INSERT INTO accounts (business_id, code, name, account_type, account_subtype,
       normal_balance, opening_balance, opening_balance_type, parent_id,
       bank_name, account_number, ifsc_code, description)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.businessId, code || null, name.trim(), accountType, accountSubtype || null,
     normalBalance || 'Dr', parseFloat(openingBalance) || 0, openingBalanceType || 'Dr',
     parentId || null, bankName || null, accountNumber || null, ifscCode || null, description || null]
  );
  res.status(201).json({ account: result.rows[0] });
});

const updateAccount = asyncHandler(async (req, res) => {
  const { name, accountSubtype, normalBalance, openingBalance, openingBalanceType,
          bankName, accountNumber, ifscCode, description } = req.body;

  const check = await query('SELECT is_system FROM accounts WHERE id=$1 AND business_id=$2', [req.params.id, req.businessId]);
  if (!check.rows.length) throw new AppError('Account not found', 404);

  const result = await query(
    `UPDATE accounts SET name=$1, account_subtype=$2, normal_balance=$3,
       opening_balance=$4, opening_balance_type=$5, bank_name=$6,
       account_number=$7, ifsc_code=$8, description=$9
     WHERE id=$10 AND business_id=$11 RETURNING *`,
    [name, accountSubtype || null, normalBalance || 'Dr',
     parseFloat(openingBalance) || 0, openingBalanceType || 'Dr',
     bankName || null, accountNumber || null, ifscCode || null, description || null,
     req.params.id, req.businessId]
  );
  res.json({ account: result.rows[0] });
});

module.exports = { listAccounts, getAccount, createAccount, updateAccount };
