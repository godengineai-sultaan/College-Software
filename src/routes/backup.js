'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/backupController');

const view = requireArea('backup');
const manage = requireManage('backup');

router.get('/', view, C.index);
router.get('/download/:name', view, C.download);

router.post('/create', manage, C.create);
router.post('/delete', manage, C.remove);

module.exports = router;
