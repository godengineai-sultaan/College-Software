'use strict';

const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');

router.get('/login', AuthController.showLogin);
router.post('/login', AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/logout', AuthController.logout);

module.exports = router;
