'use strict';

const express = require('express');
const router = express.Router();
const { requireArea } = require('../middleware/auth');
const C = require('../controllers/feesController');

// Read-only dues / defaulters overview.
router.get('/', requireArea('fees'), C.list);

module.exports = router;
