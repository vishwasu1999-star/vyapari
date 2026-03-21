'use strict';
require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const compression  = require('compression');
const morgan       = require('morgan');
const rateLimit    = require('express-rate-limit');

const logger       = require('./config/logger');
const { errorHandler } = require('./middleware/errorHandler');

// ── Route imports ─────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const businessRoutes = require('./routes/businesses');
const partyRoutes    = require('./routes/parties');
const itemRoutes     = require('./routes/items');
const invoiceRoutes  = require('./routes/invoices');
const paymentRoutes  = require('./routes/payments');
const voucherRoutes  = require('./routes/vouchers');
const reportRoutes   = require('./routes/reports');
const accountRoutes  = require('./routes/accounts');
const expenseRoutes  = require('./routes/expenses');
const syncRoutes     = require('./routes/sync');
const backupRoutes   = require('./routes/backup');
const settingsRoutes = require('./routes/settings');

const app = express();

// ============================================================
// SECURITY HEADERS
// ============================================================
app.use(helmet({
  contentSecurityPolicy: false,  // Frontend handles its own CSP
  crossOriginEmbedderPolicy: false,
}));

// ============================================================
// CORS
// ============================================================
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (native mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    // In development allow all origins for ease of testing
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    // In production strictly enforce the allowlist
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not in allowlist`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Business-ID'],
}));

// ============================================================
// BODY PARSING + COMPRESSION
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// ============================================================
// LOGGING
// ============================================================
app.use(morgan(
  process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
  {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.path === '/health',
  }
));

// ============================================================
// GLOBAL RATE LIMITER
// ============================================================
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', globalLimiter);

// ============================================================
// HEALTH CHECK  (used by Render, Railway, load balancers)
// ============================================================
app.get('/health', async (req, res) => {
  try {
    const { query } = require('./config/db');
    await query('SELECT 1');
    res.json({
      status:  'ok',
      time:    new Date().toISOString(),
      version: '1.0.0',
      db:      'connected',
    });
  } catch {
    // Respond 200 even if DB is briefly unavailable during startup
    res.json({
      status:  'ok',
      time:    new Date().toISOString(),
      version: '1.0.0',
      db:      'unavailable',
    });
  }
});

// ============================================================
// API ROUTES
// ============================================================
app.use('/api/auth',                                    authRoutes);
app.use('/api/businesses',                              businessRoutes);
app.use('/api/businesses/:businessId/parties',          partyRoutes);
app.use('/api/businesses/:businessId/items',            itemRoutes);
app.use('/api/businesses/:businessId/invoices',         invoiceRoutes);
app.use('/api/businesses/:businessId/payments',         paymentRoutes);
app.use('/api/businesses/:businessId/vouchers',         voucherRoutes);
app.use('/api/businesses/:businessId/reports',          reportRoutes);
app.use('/api/businesses/:businessId/accounts',         accountRoutes);
app.use('/api/businesses/:businessId/expenses',         expenseRoutes);
app.use('/api/businesses/:businessId/backup',           backupRoutes);
app.use('/api/businesses/:businessId/settings',         settingsRoutes);
app.use('/api/sync',                                    syncRoutes);

// ============================================================
// 404 HANDLER
// ============================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { message: `Route not found: ${req.method} ${req.path}`, code: 'NOT_FOUND' },
  });
});

// ============================================================
// CENTRALISED ERROR HANDLER (must be last)
// ============================================================
app.use(errorHandler);

module.exports = app;
