'use strict';
const express = require('express');
const { authenticate, requireBusiness }           = require('../middleware/auth');
const { requireRole, attachRole }                 = require('../middleware/rbac');
const { checkAuditLock, checkAuditLockForRecord } = require('../middleware/auditLock');
const { validateAllUUIDs }                        = require('../middleware/validateUUID');
const ctrl    = require('../controllers/invoiceController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

router.get ('/',             requireRole('invoices','view'),   ctrl.listInvoices);
router.get ('/summary',      requireRole('invoices','view'),   ctrl.getSummary);
router.post('/',             requireRole('invoices','create'),
                             checkAuditLock('invoiceDate'),    ctrl.createInvoiceHandler);
router.get ('/:id',          requireRole('invoices','view'),   ctrl.getInvoice);
router.patch('/:id',         requireRole('invoices','edit'),
                             checkAuditLockForRecord('invoices','invoice_date'), ctrl.updateInvoice);
router.delete('/:id',        requireRole('invoices','cancel'),
                             checkAuditLockForRecord('invoices','invoice_date'), ctrl.cancelInvoice);
router.get ('/:id/pdf-data', requireRole('invoices','view'),   ctrl.getPDFData);

module.exports = router;
