'use strict';
const express = require('express');
const { authenticate, requireBusiness } = require('../middleware/auth');
const { requireRole, attachRole }       = require('../middleware/rbac');
const { validateAllUUIDs }              = require('../middleware/validateUUID');
const ctrl    = require('../controllers/itemController');
const router  = express.Router({ mergeParams: true });

router.use(authenticate, requireBusiness, attachRole, validateAllUUIDs);

router.get ('/',           requireRole('items','view'),   ctrl.listItems);
router.post('/',           requireRole('items','create'), ctrl.createItem);
router.get ('/:id',        requireRole('items','view'),   ctrl.getItem);
router.put ('/:id',        requireRole('items','edit'),   ctrl.updateItem);
router.delete('/:id',      requireRole('items','delete'), ctrl.deleteItem);
router.patch('/:id/stock', requireRole('items','edit'),   ctrl.adjustStock);

module.exports = router;
