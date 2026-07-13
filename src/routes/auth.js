'use strict';

const express = require('express');
const router = express.Router();
const rateLimit = require('../middleware/rateLimit');
const AuthController = require('../controllers/authController');

// Stricter limit on login attempts (in addition to the controller's per-account
// lockout) to blunt distributed brute-force from a single IP.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Too many login attempts. Please wait a few minutes and try again.',
});

router.get('/login', AuthController.showLogin);
router.post('/login', loginLimiter, AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/logout', AuthController.logout);

module.exports = router;
