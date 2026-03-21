'use strict';
const { query }     = require('../config/db');
const { AppError }  = require('./errorHandler');

// ============================================================
// PERMISSION MATRIX
// ============================================================
// Permissions: 'view' | 'create' | 'edit' | 'delete' | 'admin'
//
//  owner      → all permissions on all resources
//  accountant → view+create+edit invoices, vouchers, reports; no user management
//  staff      → create sales invoices + receipts; view own data
//  viewer     → read-only on everything except admin

const ROLE_PERMISSIONS = {
  owner: {
    invoices:  ['view','create','edit','delete','cancel'],
    vouchers:  ['view','create','edit'],
    parties:   ['view','create','edit','delete'],
    items:     ['view','create','edit','delete'],
    payments:  ['view','create'],
    expenses:  ['view','create'],
    reports:   ['view'],
    accounts:  ['view','create','edit'],
    settings:  ['view','edit'],
    users:     ['view','invite','remove'],
    backup:    ['create','restore'],
    lock:      ['set'],
  },
  accountant: {
    invoices:  ['view','create','edit','cancel'],
    vouchers:  ['view','create','edit'],
    parties:   ['view','create','edit'],
    items:     ['view','create','edit'],
    payments:  ['view','create'],
    expenses:  ['view','create'],
    reports:   ['view'],
    accounts:  ['view','create','edit'],
    settings:  ['view'],
    users:     [],
    backup:    [],
    lock:      [],
  },
  staff: {
    invoices:  ['view','create'],
    vouchers:  [],
    parties:   ['view','create'],
    items:     ['view'],
    payments:  ['view','create'],
    expenses:  ['view','create'],
    reports:   [],
    accounts:  ['view'],
    settings:  ['view'],
    users:     [],
    backup:    [],
    lock:      [],
  },
  viewer: {
    invoices:  ['view'],
    vouchers:  ['view'],
    parties:   ['view'],
    items:     ['view'],
    payments:  ['view'],
    expenses:  ['view'],
    reports:   ['view'],
    accounts:  ['view'],
    settings:  ['view'],
    users:     [],
    backup:    [],
    lock:      [],
  },
};

// ============================================================
// getRoleForBusiness
// Returns the role of req.user for req.businessId
// Must be called after authenticate + requireBusiness
// ============================================================
const getUserRole = async (userId, businessId) => {
  // Business owner always gets 'owner' role (no entry needed in user_roles)
  const ownerCheck = await query(
    'SELECT id FROM businesses WHERE id=$1 AND owner_id=$2',
    [businessId, userId]
  );
  if (ownerCheck.rows.length) return 'owner';

  // Look up explicit role assignment
  const roleResult = await query(
    `SELECT role FROM user_roles
     WHERE business_id=$1 AND user_id=$2 AND is_active=TRUE`,
    [businessId, userId]
  );
  return roleResult.rows[0]?.role || null;
};

// ============================================================
// requireRole middleware factory
// Usage: requireRole('invoices', 'create')
// ============================================================
const requireRole = (resource, action) => async (req, res, next) => {
  try {
    const role = await getUserRole(req.user.id, req.businessId);

    if (!role) {
      return next(new AppError('You do not have access to this business', 403));
    }

    const allowed = ROLE_PERMISSIONS[role]?.[resource] || [];
    if (!allowed.includes(action)) {
      return next(new AppError(
        `Permission denied. Your role (${role}) cannot perform '${action}' on '${resource}'.`,
        403
      ));
    }

    req.userRole = role;
    next();
  } catch (err) {
    next(err);
  }
};

// ============================================================
// requireAnyRole — allow if role is in provided list
// ============================================================
const requireAnyRole = (...roles) => async (req, res, next) => {
  try {
    const role = await getUserRole(req.user.id, req.businessId);
    if (!role || !roles.includes(role)) {
      return next(new AppError(`Access restricted to: ${roles.join(', ')}`, 403));
    }
    req.userRole = role;
    next();
  } catch (err) {
    next(err);
  }
};

// ============================================================
// attachRole — just attaches role to req without blocking
// ============================================================
const attachRole = async (req, res, next) => {
  try {
    req.userRole = await getUserRole(req.user.id, req.businessId);
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { requireRole, requireAnyRole, attachRole, getUserRole, ROLE_PERMISSIONS };
