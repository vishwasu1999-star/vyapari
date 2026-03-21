'use strict';
const express = require('express');
const { authenticate, requireBusiness } = require('../middleware/auth');
const { requireAnyRole, attachRole }    = require('../middleware/rbac');
const { validateAllUUIDs }              = require('../middleware/validateUUID');
const ctrl    = require('../controllers/backupController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

router.get ('/',        requireAnyRole('owner', 'accountant'), ctrl.listBackups);
router.post('/create',  requireAnyRole('owner', 'accountant'), ctrl.createBackup);
router.post('/restore', requireAnyRole('owner'),               ctrl.restoreBackup);

module.exports = router;
