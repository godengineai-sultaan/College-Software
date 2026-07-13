'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/settingsController');

router.get('/', requireArea('settings'), C.index);
router.post('/', requireManage('settings'), C.save);

module.exports = router;
