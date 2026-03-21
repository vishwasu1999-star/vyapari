'use strict';
const express = require('express');
const { authenticate, requireBusiness } = require('../middleware/auth');
const { requireRole, attachRole }       = require('../middleware/rbac');
const { validateAllUUIDs }              = require('../middleware/validateUUID');
const ctrl    = require('../controllers/accountController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

router.get ('/',    requireRole('accounts','view'),   ctrl.listAccounts);
router.post('/',    requireRole('accounts','create'), ctrl.createAccount);
router.get ('/:id', requireRole('accounts','view'),   ctrl.getAccount);
router.put ('/:id', requireRole('accounts','edit'),   ctrl.updateAccount);

module.exports = router;
