'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/discountController');

// Discounts live under the 'structures' area (fee configuration).
const view = requireArea('structures');
const manage = requireManage('structures');

router.get('/', view, C.list);
router.get('/new', manage, C.newForm);
router.post('/', manage, C.create);
router.post('/:id/approve', manage, C.approve);
router.post('/:id/reject', manage, C.reject);

module.exports = router;
