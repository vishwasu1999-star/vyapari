'use strict';
const { query, withTransaction } = require('../config/db');
const { asyncHandler, AppError, ApiResponse } = require('../middleware/errorHandler');
const { getUserRole, ROLE_PERMISSIONS } = require('../middleware/rbac');
const logger = require('../config/logger');

// ============================================================
// GET /api/businesses/:businessId/settings
// ============================================================
const getSettings = asyncHandler(async (req, res) => {
  const [bizResult, membersResult, fyResult] = await Promise.all([
    query('SELECT * FROM businesses WHERE id=$1', [req.businessId]),
    query(
      `SELECT ur.id, ur.role, ur.is_active, ur.created_at,
              u.id AS user_id, u.name, u.email
       FROM user_roles ur
       JOIN users u ON u.id = ur.user_id
       WHERE ur.business_id=$1
       ORDER BY ur.created_at`,
      [req.businessId]
    ),
    query(
      `SELECT fy_year, seq_type, last_seq, prefix
       FROM fy_sequences WHERE business_id=$1 ORDER BY fy_year DESC, seq_type`,
      [req.businessId]
    ),
  ]);

  if (!bizResult.rows.length) throw new AppError('Business not found', 404);

  ApiResponse.success(res, {
    business:   bizResult.rows[0],
    members:    membersResult.rows,
    fySequences: fyResult.rows,
    permissions: ROLE_PERMISSIONS[req.userRole] || {},
  });
});

// ============================================================
// PATCH /api/businesses/:businessId/settings/lock-date
// Owner/accountant only
// ============================================================
const setLockDate = asyncHandler(async (req, res) => {
  if (!['owner', 'accountant'].includes(req.userRole)) {
    throw new AppError('Only owner or accountant can set lock date', 403, 'FORBIDDEN');
  }

  const { lockDate } = req.body;

  if (!lockDate) throw new AppError('lockDate is required', 400);

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(lockDate)) throw new AppError('lockDate must be YYYY-MM-DD', 400);

  // Ensure lock date isn't in the future
  if (new Date(lockDate) > new Date()) {
    throw new AppError('Lock date cannot be in the future', 400);
  }

  await query(
    'UPDATE businesses SET lock_date=$1, updated_at=NOW() WHERE id=$2',
    [lockDate, req.businessId]
  );

  await query(
    `INSERT INTO audit_logs (business_id, user_id, action, entity, entity_id, new_values, ip_address)
     VALUES ($1,$2,'SET_LOCK_DATE','business',$1,$3,$4)`,
    [req.businessId, req.user.id, JSON.stringify({ lockDate }), req.ip]
  );

  logger.info('Lock date set', { bizId: req.businessId, lockDate, by: req.user.id });
  ApiResponse.success(res, { lockDate, message: `Period locked up to ${lockDate}` });
});

// ============================================================
// PATCH /api/businesses/:businessId/settings/stock
// ============================================================
const updateStockSettings = asyncHandler(async (req, res) => {
  if (req.userRole === 'viewer' || req.userRole === 'staff') {
    throw new AppError('Insufficient permissions to change stock settings', 403, 'FORBIDDEN');
  }

  const { allowNegativeStock } = req.body;

  if (allowNegativeStock === undefined) {
    throw new AppError('allowNegativeStock (boolean) is required', 400);
  }

  await query(
    'UPDATE businesses SET allow_negative_stock=$1, updated_at=NOW() WHERE id=$2',
    [!!allowNegativeStock, req.businessId]
  );

  ApiResponse.success(res, {
    allowNegativeStock: !!allowNegativeStock,
    message: `Negative stock is now ${allowNegativeStock ? 'allowed' : 'blocked'}`,
  });
});

// ============================================================
// PATCH /api/businesses/:businessId/settings/fy
// Set current financial year start date
// ============================================================
const updateFYSettings = asyncHandler(async (req, res) => {
  if (req.userRole !== 'owner') {
    throw new AppError('Only business owner can change financial year settings', 403, 'FORBIDDEN');
  }

  const { fyStart, enableFyReset } = req.body;

  if (fyStart && !/^\d{4}-04-01$/.test(fyStart)) {
    throw new AppError('fyStart must be April 1st of any year (YYYY-04-01)', 400);
  }

  const updates = [];
  const params  = [];

  if (fyStart !== undefined) {
    params.push(fyStart);
    updates.push(`current_fy_start=$${params.length}`);
  }
  if (enableFyReset !== undefined) {
    params.push(!!enableFyReset);
    updates.push(`enable_fy_reset=$${params.length}`);
  }

  if (!updates.length) throw new AppError('No fields to update', 400);

  params.push(req.businessId);
  await query(
    `UPDATE businesses SET ${updates.join(', ')}, updated_at=NOW() WHERE id=$${params.length}`,
    params
  );

  ApiResponse.success(res, { message: 'Financial year settings updated' });
});

// ============================================================
// POST /api/businesses/:businessId/settings/members
// Invite a user to the business with a role
// ============================================================
const inviteMember = asyncHandler(async (req, res) => {
  if (req.userRole !== 'owner') {
    throw new AppError('Only business owner can invite members', 403, 'FORBIDDEN');
  }

  const { email, role } = req.body;

  if (!email) throw new AppError('email is required', 400);
  if (!['accountant', 'staff', 'viewer'].includes(role)) {
    throw new AppError("role must be accountant, staff, or viewer", 400);
  }

  // Find user by email
  const userResult = await query('SELECT id, name FROM users WHERE email=$1 AND is_active=TRUE', [email.toLowerCase()]);
  if (!userResult.rows.length) {
    throw new AppError('No user found with that email address', 404, 'USER_NOT_FOUND');
  }

  const invitedUser = userResult.rows[0];

  // Cannot invite the owner
  const ownerCheck = await query('SELECT id FROM businesses WHERE id=$1 AND owner_id=$2', [req.businessId, invitedUser.id]);
  if (ownerCheck.rows.length) {
    throw new AppError('Cannot assign a role to the business owner', 400);
  }

  // Upsert role
  await query(
    `INSERT INTO user_roles (business_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (business_id, user_id) DO UPDATE SET role=$3, is_active=TRUE, updated_at=NOW()`,
    [req.businessId, invitedUser.id, role, req.user.id]
  );

  await query(
    `INSERT INTO audit_logs (business_id, user_id, action, entity, entity_id, new_values, ip_address)
     VALUES ($1,$2,'INVITE_MEMBER','user_role',$3,$4,$5)`,
    [req.businessId, req.user.id, invitedUser.id, JSON.stringify({ email, role }), req.ip]
  );

  ApiResponse.created(res, {
    userId: invitedUser.id,
    name:   invitedUser.name,
    email,
    role,
    message: `${invitedUser.name} added as ${role}`,
  });
});

// ============================================================
// DELETE /api/businesses/:businessId/settings/members/:userId
// ============================================================
const removeMember = asyncHandler(async (req, res) => {
  if (req.userRole !== 'owner') {
    throw new AppError('Only business owner can remove members', 403, 'FORBIDDEN');
  }

  const { userId } = req.params;

  // Cannot remove self
  if (userId === req.user.id) {
    throw new AppError('You cannot remove yourself from the business', 400);
  }

  const result = await query(
    `UPDATE user_roles SET is_active=FALSE, updated_at=NOW()
     WHERE business_id=$1 AND user_id=$2 AND is_active=TRUE
     RETURNING id`,
    [req.businessId, userId]
  );

  if (!result.rows.length) {
    throw new AppError('Member not found in this business', 404);
  }

  ApiResponse.success(res, { message: 'Member removed from business' });
});

// ============================================================
// GET /api/businesses/:businessId/settings/fy/carry-forward
// Calculate and optionally apply FY carry-forward balances
// ============================================================
const carryForwardBalances = asyncHandler(async (req, res) => {
  if (!['owner', 'accountant'].includes(req.userRole)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const { toFyYear, apply = false } = req.body;

  if (!toFyYear || typeof toFyYear !== 'number') {
    throw new AppError('toFyYear (integer, e.g. 2024) is required', 400);
  }

  const fyEndDate = `${toFyYear + 1}-03-31`;

  // Calculate closing balances for all accounts up to FY end
  const result = await query(
    `SELECT
       a.id AS account_id,
       a.code,
       a.name,
       a.account_type,
       a.opening_balance,
       a.opening_balance_type,
       COALESCE(SUM(le.debit),  0) AS total_dr,
       COALESCE(SUM(le.credit), 0) AS total_cr
     FROM accounts a
     LEFT JOIN ledger_entries le ON le.account_id = a.id
       AND le.business_id = $1
     LEFT JOIN vouchers v ON v.id = le.voucher_id
       AND v.is_posted    = TRUE
       AND v.voucher_date <= $2
     WHERE a.business_id = $1 AND a.is_group = FALSE
     GROUP BY a.id, a.code, a.name, a.account_type, a.opening_balance, a.opening_balance_type`,
    [req.businessId, fyEndDate]
  );

  const balances = result.rows.map(row => {
    const obDr = row.opening_balance_type === 'Dr' ? parseFloat(row.opening_balance) : 0;
    const obCr = row.opening_balance_type === 'Cr' ? parseFloat(row.opening_balance) : 0;
    const netDr = obDr + parseFloat(row.total_dr);
    const netCr = obCr + parseFloat(row.total_cr);
    const net   = netDr - netCr;

    return {
      accountId:   row.account_id,
      code:        row.code,
      name:        row.name,
      accountType: row.account_type,
      openingDr:   net >= 0 ? net : 0,
      openingCr:   net <  0 ? Math.abs(net) : 0,
    };
  });

  if (apply) {
    // Only carry forward balance sheet accounts (not P&L)
    const bsAccounts = balances.filter(b =>
      ['Asset', 'Liability', 'Equity'].includes(b.accountType) &&
      (b.openingDr > 0 || b.openingCr > 0)
    );

    await withTransaction(async (client) => {
      for (const b of bsAccounts) {
        await client.query(
          `INSERT INTO fy_opening_balances (business_id, account_id, fy_year, opening_dr, opening_cr, is_finalized)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           ON CONFLICT (business_id, account_id, fy_year) DO UPDATE
           SET opening_dr=$4, opening_cr=$5, is_finalized=TRUE, updated_at=NOW()`,
          [req.businessId, b.accountId, toFyYear + 1, b.openingDr, b.openingCr]
        );
      }

      // Update business FY start for next year
      await client.query(
        'UPDATE businesses SET current_fy_start=$1, updated_at=NOW() WHERE id=$2',
        [`${toFyYear + 1}-04-01`, req.businessId]
      );
    });

    logger.info('FY carry-forward applied', { bizId: req.businessId, toFyYear, accounts: bsAccounts.length });
  }

  ApiResponse.success(res, {
    fyYear:    toFyYear,
    fyEndDate,
    balances:  balances.filter(b => b.openingDr > 0 || b.openingCr > 0),
    applied:   apply,
    message:   apply ? `Carry-forward balances applied for FY ${toFyYear + 1}` : 'Preview only — pass apply:true to commit',
  });
});

module.exports = {
  getSettings,
  setLockDate,
  updateStockSettings,
  updateFYSettings,
  inviteMember,
  removeMember,
  carryForwardBalances,
};
