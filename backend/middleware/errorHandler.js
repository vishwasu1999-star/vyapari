'use strict';
const logger = require('../config/logger');

// ============================================================
// ASYNC HANDLER WRAPPER
// ============================================================
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ============================================================
// UNIFIED API RESPONSE HELPERS
// All responses use: { success, data, meta } or { success, error }
// ============================================================
const ApiResponse = {
  success(res, data = {}, meta = {}, status = 200) {
    return res.status(status).json({
      success: true,
      data,
      ...(Object.keys(meta).length ? { meta } : {}),
    });
  },
  created(res, data = {}) {
    return ApiResponse.success(res, data, {}, 201);
  },
  paginated(res, rows, pagination) {
    return res.status(200).json({ success: true, data: rows, pagination });
  },
  error(res, message, statusCode = 400, code = null, details = null) {
    return res.status(statusCode).json({
      success: false,
      error: {
        message,
        ...(code    ? { code }    : {}),
        ...(details ? { details } : {}),
      },
    });
  },
};

// ============================================================
// CENTRALISED ERROR HANDLER (must be last middleware)
// ============================================================
const errorHandler = (err, req, res, next) => {
  logger.error(`[${req.method}] ${req.path}`, {
    message: err.message,
    stack:   process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    pgCode:  err.code,
  });

  // PostgreSQL constraint errors
  if (err.code === '23505') {
    const match = (err.detail || '').match(/Key \((.+?)\)=\((.+?)\) already exists/);
    return ApiResponse.error(res, `Duplicate entry: ${match ? match[1] : 'field'} already exists`, 409, 'DUPLICATE');
  }
  if (err.code === '23503') return ApiResponse.error(res, 'Referenced record does not exist', 400, 'FK_VIOLATION');
  if (err.code === '23514') return ApiResponse.error(res, `Constraint violation: ${err.detail || err.message}`, 400, 'CONSTRAINT');
  if (err.code === '22P02') return ApiResponse.error(res, 'Invalid ID format', 400, 'INVALID_ID');

  // Custom PG RAISE EXCEPTION from triggers
  if (err.code === 'P0001') return ApiResponse.error(res, err.message, 409, 'INSUFFICIENT_STOCK');
  if (err.code === 'P0002') return ApiResponse.error(res, err.message, 423, 'PERIOD_LOCKED');

  // JWT errors
  if (err.name === 'JsonWebTokenError') return ApiResponse.error(res, 'Invalid authentication token', 401, 'INVALID_TOKEN');
  if (err.name === 'TokenExpiredError') return ApiResponse.error(res, 'Authentication token has expired', 401, 'TOKEN_EXPIRED');

  // Operational app errors (AppError class)
  if (err.isOperational) return ApiResponse.error(res, err.message, err.status || 400, err.code || null);

  // HTTP 423 Locked
  if (err.status === 423) return ApiResponse.error(res, err.message, 423, 'PERIOD_LOCKED');

  // Default
  const status  = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500 ? 'Internal server error' : err.message || 'Internal server error';
  return ApiResponse.error(res, message, status);
};

// ============================================================
// OPERATIONAL ERROR CLASS
// ============================================================
class AppError extends Error {
  constructor(message, status = 400, code = null) {
    super(message);
    this.status        = status;
    this.code          = code;
    this.isOperational = true;
  }
}

// ============================================================
// VALIDATION HELPER (express-validator)
// ============================================================
const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return ApiResponse.error(
      res, 'Validation failed', 422, 'VALIDATION_ERROR',
      errors.array().map(e => ({ field: e.path, message: e.msg }))
    );
  }
  next();
};

module.exports = { asyncHandler, errorHandler, AppError, validate, ApiResponse };
