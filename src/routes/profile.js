'use strict';

const express = require('express');
const router = express.Router();
const ProfileController = require('../controllers/profileController');

router.get('/', ProfileController.show);
router.post('/', ProfileController.updateProfile);
router.get('/password', ProfileController.showPassword);
router.post('/password', ProfileController.updatePassword);

module.exports = router;
