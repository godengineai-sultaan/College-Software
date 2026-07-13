'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/receiptController');

router.get('/', requireArea('receipts'), C.list);
router.get('/:id', requireArea('receipts'), C.show);
router.get('/:id/print', requireArea('receipts'), C.print);
router.post('/:id/cancel', requireManage('receipts'), C.cancel);

module.exports = router;
