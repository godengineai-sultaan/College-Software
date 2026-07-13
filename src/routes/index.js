'use strict';

/**
 * Central route registration. Public auth routes first, then everything else
 * behind requireAuth.
 */

const { requireAuth } = require('../middleware/auth');

module.exports = function (app) {
  // Public
  app.use('/', require('./auth'));
  app.get('/', (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));

  // Everything below requires a logged-in user.
  app.use(requireAuth);

  app.use('/dashboard', require('./dashboard'));
  app.use('/profile', require('./profile'));

  // Feature modules (mounted as they are built).
  const modules = [
    ['/students', './students'],
    ['/collection', './collection'],
    ['/receipts', './receipts'],
    ['/fees', './fees'],
    ['/structures', './structures'],
    ['/discounts', './discounts'],
    ['/examforms', './examforms'],
    ['/expenses', './expenses'],
    ['/reports', './reports'],
    ['/exports', './exports'],
    ['/notifications', './notifications'],
    ['/branches', './branches'],
    ['/courses', './courses'],
    ['/users', './users'],
    ['/audit', './audit'],
    ['/backup', './backup'],
    ['/settings', './settings'],
  ];
  for (const [mount, mod] of modules) {
    try {
      app.use(mount, require(mod));
    } catch (err) {
      if (err && err.code === 'MODULE_NOT_FOUND' && err.message.includes(mod.replace('./', ''))) {
        // Not built yet — skip quietly during incremental development.
        continue;
      }
      throw err;
    }
  }
};
