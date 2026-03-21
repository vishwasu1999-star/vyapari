'use strict';
const express = require('express');
const { authenticate, requireBusiness } = require('../middleware/auth');
const { requireRole, attachRole }       = require('../middleware/rbac');
const { checkAuditLock }                = require('../middleware/auditLock');
const { validateAllUUIDs }              = require('../middleware/validateUUID');
const ctrl    = require('../controllers/paymentController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

router.get ('/',    requireRole('payments','view'),   ctrl.listPayments);
router.post('/',    requireRole('payments','create'),
                    checkAuditLock('paymentDate'),    ctrl.createPayment);
router.get ('/:id', requireRole('payments','view'),   ctrl.getPayment);

module.exports = router;
