'use strict';

/**
 * Lightweight CSRF protection with no external dependency.
 *
 * A random token is stored in the session and must be echoed back in a hidden
 * `_csrf` form field (or an `x-csrf-token` header) on any state-changing
 * request. Views render it via the `csrfToken` local (see the `csrfField`
 * helper exposed on res.locals).
 */

const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function csrf(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  const token = req.session.csrfToken;

  res.locals.csrfToken = token;
  res.locals.csrfField = () =>
    `<input type="hidden" name="_csrf" value="${token}">`;

  if (SAFE_METHODS.has(req.method)) return next();

  // Multipart bodies are parsed later (by multer, in the route), so the token
  // isn't in req.body yet. Defer to a per-route `verify` placed AFTER multer.
  const contentType = req.headers['content-type'] || '';
  if (contentType.startsWith('multipart/form-data')) return next();

  return verify(req, res, next);
}

/** Validate the CSRF token from the (already parsed) request body/headers. */
function verify(req, res, next) {
  const token = req.session && req.session.csrfToken;
  const provided =
    (req.body && req.body._csrf) ||
    req.headers['x-csrf-token'] ||
    req.headers['x-xsrf-token'];

  if (token && provided && provided === token) return next();

  return res.status(403).render('errors/403', {
    title: 'Security check failed',
    layout: 'layouts/auth',
    message: 'Your session expired or the form was tampered with. Please try again.',
  });
}

module.exports = csrf;
module.exports.verify = verify;
