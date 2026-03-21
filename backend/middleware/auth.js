'use strict';
const jwt    = require('jsonwebtoken');
const { query } = require('../config/db');
const { AppError } = require('./errorHandler');

// ============================================================
// authenticate — verify Bearer token, attach req.user
// ============================================================
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return next(new AppError('Authentication required', 401));
    }

    const token   = header.slice(7);
    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return next(new AppError('Token expired — please refresh', 401));
      }
      return next(new AppError('Invalid authentication token', 401));
    }

    // Verify user still exists and is active
    const result = await query(
      'SELECT id, name, email, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!result.rows.length) {
      return next(new AppError('User account not found', 401));
    }
    if (!result.rows[0].is_active) {
      return next(new AppError('User account is deactivated', 401));
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    next(err);
  }
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// requireBusiness — verify user has access to the requested business
// Access is granted if the user is the owner OR has an active
// entry in user_roles for that business.
// Attaches req.businessId to the request.
// ============================================================
const requireBusiness = async (req, res, next) => {
  try {
    const businessId = req.params.businessId
      || req.body.businessId
      || req.query.businessId
      || req.headers['x-business-id'];

    if (!businessId) {
      return next(new AppError('businessId is required', 400));
    }

    // Validate UUID format before hitting the database
    if (!UUID_RE.test(businessId)) {
      return next(new AppError('Invalid businessId: must be a valid UUID', 400, 'INVALID_ID'));
    }

    // First confirm the business exists and is active
    const bizResult = await query(
      'SELECT id, owner_id FROM businesses WHERE id = $1 AND is_active = TRUE',
      [businessId]
    );

    if (!bizResult.rows.length) {
      return next(new AppError('Business not found', 404));
    }

    const biz = bizResult.rows[0];

    // Grant access if: user is owner
    if (biz.owner_id === req.user.id) {
      req.businessId = businessId;
      return next();
    }

    // Grant access if: user has an active role assignment
    const roleResult = await query(
      'SELECT id FROM user_roles WHERE business_id = $1 AND user_id = $2 AND is_active = TRUE',
      [businessId, req.user.id]
    );

    if (!roleResult.rows.length) {
      return next(new AppError('Access denied to this business', 403));
    }

    req.businessId = businessId;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticate, requireBusiness };
