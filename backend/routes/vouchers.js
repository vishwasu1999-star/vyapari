'use strict';
const express = require('express');
const { authenticate, requireBusiness } = require('../middleware/auth');
const { requireRole, attachRole }       = require('../middleware/rbac');
const { checkAuditLock }                = require('../middleware/auditLock');
const { validateAllUUIDs }              = require('../middleware/validateUUID');
const ctrl    = require('../controllers/voucherController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

router.get ('/',    requireRole('vouchers','view'),   ctrl.listVouchers);
router.post('/',    requireRole('vouchers','create'),
                    checkAuditLock('date'),           ctrl.createManualVoucher);
router.get ('/:id', requireRole('vouchers','view'),   ctrl.getVoucher);

module.exports = router;
