'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/collectionController');

router.get('/', requireArea('collection'), C.index);
router.post('/', requireManage('collection'), C.collect);

module.exports = router;
