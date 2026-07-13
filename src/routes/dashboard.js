'use strict';

const express = require('express');
const router = express.Router();
const { requireArea } = require('../middleware/auth');
const DashboardController = require('../controllers/dashboardController');

router.get('/', requireArea('dashboard'), DashboardController.index);

module.exports = router;
