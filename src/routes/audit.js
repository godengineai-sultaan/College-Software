'use strict';

const express = require('express');
const router = express.Router();
const { requireArea } = require('../middleware/auth');
const C = require('../controllers/auditController');

// Read-only — view access only, no mutations.
router.get('/', requireArea('audit'), C.list);

module.exports = router;
