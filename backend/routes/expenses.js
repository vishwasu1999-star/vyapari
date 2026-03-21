'use strict';
const express = require('express');
const { authenticate, requireBusiness } = require('../middleware/auth');
const { requireRole, attachRole }       = require('../middleware/rbac');
const { checkAuditLock }                = require('../middleware/auditLock');
const { validateAllUUIDs }              = require('../middleware/validateUUID');
const ctrl    = require('../controllers/expenseController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

router.get ('/', requireRole('expenses','view'),   ctrl.listExpenses);
router.post('/', requireRole('expenses','create'),
                 checkAuditLock('expenseDate'),    ctrl.createExpense);

module.exports = router;
