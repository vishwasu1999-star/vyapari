'use strict';
const express  = require('express');
const { authenticate, requireBusiness } = require('../middleware/auth');
const { requireAnyRole, attachRole }    = require('../middleware/rbac');
const { validateUUID }                  = require('../middleware/validateUUID');
const ctrl     = require('../controllers/businessController');
const router   = express.Router();

// List + create: any authenticated user (no businessId path param)
router.get ('/', authenticate, ctrl.listBusinesses);
router.post('/', authenticate, ctrl.createBusiness);

// Read: validate UUID first, then requireBusiness (owner OR invited)
router.get ('/:businessId',
  authenticate,
  validateUUID('businessId'),
  requireBusiness, attachRole,
  ctrl.getBusiness
);

// Update: validate UUID first, then owner-only
router.put ('/:businessId',
  authenticate,
  validateUUID('businessId'),
  requireBusiness, attachRole,
  requireAnyRole('owner'),
  ctrl.updateBusiness
);

module.exports = router;
