'use strict';
const express   = require('express');
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const ctrl      = require('../controllers/authController');

const router = express.Router();

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message:  { error: 'Too many auth attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Slightly looser limit for refresh (tokens expire, clients legitimately retry)
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      60,
  message:  { error: 'Too many refresh attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes (no token needed)
router.post('/register',        authLimiter,    ctrl.register);
router.post('/login',           authLimiter,    ctrl.login);
router.post('/refresh',         refreshLimiter, ctrl.refresh);
router.post('/logout',          refreshLimiter, ctrl.logout);

// Protected routes
router.get ('/me',              authenticate, ctrl.me);
router.put ('/change-password', authenticate, ctrl.changePassword);

module.exports = router;
