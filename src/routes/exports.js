'use strict';

/**
 * M8 — Data Merge & Export routes. All downloads guarded by requireArea.
 */

const express = require('express');
const router = express.Router();
const { requireArea } = require('../middleware/auth');
const C = require('../controllers/exportController');

const view = requireArea('exports');

router.get('/', view, C.index);
router.get('/consolidated.xls', view, C.consolidated);
router.get('/students.csv', view, C.studentsCsv);
router.get('/receipts.csv', view, C.receiptsCsv);
router.get('/expenses.csv', view, C.expensesCsv);

module.exports = router;
