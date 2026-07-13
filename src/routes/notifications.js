'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/notificationController');

const view = requireArea('notifications');
const manage = requireManage('notifications');

router.get('/', view, C.list);

// Compose + send a manual notification.
router.get('/compose', manage, C.composeForm);
router.post('/send', manage, C.send);

// Bulk fee-due reminders.
router.post('/remind', manage, C.remind);

module.exports = router;
