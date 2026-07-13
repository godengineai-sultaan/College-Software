'use strict';

/**
 * Minimal flash-message support (no external dependency).
 * Usage: req.flash('success', 'Saved!'); then read res.locals.flash in views.
 */

function flash(req, res, next) {
  if (!req.session.flash) req.session.flash = {};

  req.flash = function (type, message) {
    if (!req.session.flash[type]) req.session.flash[type] = [];
    req.session.flash[type].push(message);
  };

  // Expose current flash messages to views, then clear them.
  res.locals.flash = req.session.flash;
  req.session.flash = {};

  next();
}

module.exports = flash;
