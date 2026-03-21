'use strict';
const express = require('express');
const { authenticate, requireBusiness } = require('../middleware/auth');
const { requireRole, attachRole }       = require('../middleware/rbac');
const { validateAllUUIDs }              = require('../middleware/validateUUID');
const ctrl    = require('../controllers/partyController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

router.get   ('/',    requireRole('parties','view'),   ctrl.listParties);
router.post  ('/',    requireRole('parties','create'), ctrl.createParty);
router.get   ('/:id', requireRole('parties','view'),   ctrl.getParty);
router.put   ('/:id', requireRole('parties','edit'),   ctrl.updateParty);
router.delete('/:id', requireRole('parties','delete'), ctrl.deleteParty);

module.exports = router;
