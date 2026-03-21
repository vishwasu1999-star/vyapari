'use strict';
const { AppError } = require('./errorHandler');

// UUID v4 pattern
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUUID = (str) => UUID_RE.test(str);

// ============================================================
// validateUUID(paramName)
// Middleware factory — rejects request with 400 if the named
// path parameter is not a valid UUID before it reaches the DB.
//
// This prevents:
//  - SQL injection via malformed IDs (pg also blocks this, but
//    we want an explicit 400 before any query is attempted)
//  - Cross-business probing with crafted non-UUID strings
//  - Confusing 500s from pg type mismatch errors
//
// Usage in routes:
//   router.get('/:id', validateUUID('id'), ctrl.get)
// ============================================================
const validateUUID = (...paramNames) => (req, res, next) => {
  for (const name of paramNames) {
    const value = req.params[name];
    if (value && !isValidUUID(value)) {
      return next(new AppError(`Invalid ${name}: must be a valid UUID`, 400, 'INVALID_ID'));
    }
  }
  next();
};

// ============================================================
// validateUUIDs
// Validates ALL UUID-shaped path params automatically.
// Apply as router-level middleware to validate every param
// that looks like it should be a UUID.
//
// Usage:
//   router.use(validateAllUUIDs);
// ============================================================
const UUID_PARAM_SUFFIXES = ['Id', 'id']; // matches businessId, partyId, accountId, :id, etc.

const validateAllUUIDs = (req, res, next) => {
  for (const [key, value] of Object.entries(req.params)) {
    const looksLikeUUID = UUID_PARAM_SUFFIXES.some(suffix => key.endsWith(suffix)) || key === 'id';
    if (looksLikeUUID && value && !isValidUUID(value)) {
      return next(new AppError(`Invalid ${key}: must be a valid UUID`, 400, 'INVALID_ID'));
    }
  }
  next();
};

module.exports = { validateUUID, validateAllUUIDs, isValidUUID };
