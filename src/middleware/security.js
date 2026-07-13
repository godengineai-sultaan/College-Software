'use strict';

/**
 * Security headers (a dependency-free subset of what Helmet provides).
 *
 * Keeping this in-house avoids an extra dependency and supply-chain surface,
 * while still setting the headers that matter for this server-rendered app.
 * The Content-Security-Policy is deliberately strict: the app ships all its
 * own CSS/JS locally, so no external origins are allowed and inline scripts
 * are blocked (we use a small external /js/app.js, not inline handlers).
 */

const config = require('../config');

function securityHeaders(req, res, next) {
  // Clickjacking / MIME sniffing / referrer.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0'); // modern browsers rely on CSP
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Content Security Policy. 'unsafe-inline' is allowed for styles only,
  // because a handful of views use small inline style attributes; scripts are
  // restricted to same-origin files (no inline script execution).
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
    ].join('; ')
  );

  // HSTS only makes sense over HTTPS (production behind a TLS proxy).
  if (config.env === 'production' && process.env.TRUST_PROXY === '1') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  // Don't leak the framework.
  res.removeHeader('X-Powered-By');
  next();
}

module.exports = securityHeaders;
