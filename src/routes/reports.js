'use strict';

/**
 * M7 — Reports & Analytics routes. All read-only, guarded by requireArea.
 */

const express = require('express');
const router = express.Router();
const { requireArea } = require('../middleware/auth');
const C = require('../controllers/reportController');

const view = requireArea('reports');

router.get('/', view, C.index);
router.get('/defaulters', view, C.defaulters);
router.get('/collection', view, C.collection);

module.exports = router;
