'use strict';
const express = require('express');
const { authenticate, requireBusiness }       = require('../middleware/auth');
const { requireRole, requireAnyRole, attachRole } = require('../middleware/rbac');
const { validateAllUUIDs }                    = require('../middleware/validateUUID');
const ctrl    = require('../controllers/settingsController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

// All roles can read settings
router.get('/', requireRole('settings','view'), ctrl.getSettings);

// Lock date: owner + accountant
router.patch('/lock-date', requireAnyRole('owner','accountant'), ctrl.setLockDate);

// Stock config: owner + accountant
router.patch('/stock', requireAnyRole('owner','accountant'), ctrl.updateStockSettings);

// FY settings: owner only
router.patch('/fy',              requireAnyRole('owner'), ctrl.updateFYSettings);
router.post ('/fy/carry-forward',requireAnyRole('owner'), ctrl.carryForwardBalances);

// Member management: owner only
router.post  ('/members',          requireAnyRole('owner'), ctrl.inviteMember);
router.delete('/members/:userId',  requireAnyRole('owner'), ctrl.removeMember);

module.exports = router;
