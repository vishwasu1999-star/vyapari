'use strict';
const express = require('express');
const { authenticate, requireBusiness } = require('../middleware/auth');
const { requireRole, attachRole }       = require('../middleware/rbac');
const { validateAllUUIDs }              = require('../middleware/validateUUID');
const ctrl    = require('../controllers/reportController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

// Dashboard: all roles (shows only aggregate counts, no detail)
router.get('/dashboard', ctrl.dashboard);

// Financial reports: owner, accountant, viewer — NOT staff (staff.reports = [])
router.get('/trial-balance',             requireRole('reports','view'), ctrl.trialBalance);
router.get('/profit-loss',               requireRole('reports','view'), ctrl.profitLoss);
router.get('/balance-sheet',             requireRole('reports','view'), ctrl.balanceSheet);
router.get('/day-book',                  requireRole('reports','view'), ctrl.dayBook);
router.get('/gst',                       requireRole('reports','view'), ctrl.gstReport);
router.get('/cash-book',                 requireRole('reports','view'), ctrl.cashBook);
router.get('/account-ledger/:accountId', requireRole('reports','view'), ctrl.accountLedger);

module.exports = router;
