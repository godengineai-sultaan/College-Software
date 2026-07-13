'use strict';

/**
 * Central application configuration.
 *
 * Every tunable value is read from environment variables (see .env.example)
 * with a sensible default, so the software runs out-of-the-box for the client
 * and can be reconfigured without touching code.
 */

const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..', '..');

const config = {
  root: ROOT,
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,

  session: {
    secret: process.env.SESSION_SECRET || 'college-software-dev-secret-change-me',
    // 8 hours — a typical working day
    maxAge: 1000 * 60 * 60 * 8,
  },

  db: {
    file: path.resolve(ROOT, process.env.DATABASE_FILE || 'data/college.sqlite'),
  },

  uploads: {
    dir: path.resolve(ROOT, 'public', 'uploads'),
    maxFileSize: 5 * 1024 * 1024, // 5 MB
  },

  // Bootstrap administrator — created once by the seed script.
  admin: {
    name: process.env.ADMIN_NAME || 'System Administrator',
    email: process.env.ADMIN_EMAIL || 'admin@college.edu',
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
  },
};

module.exports = config;
