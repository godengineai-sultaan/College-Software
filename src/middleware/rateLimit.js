'use strict';

/**
 * A small, dependency-free rate limiter (fixed-window per key).
 *
 * Good enough to blunt brute-force and abusive bursts on a single-node
 * deployment. For a multi-node cluster, back this with Redis instead — the
 * interface (a middleware factory) stays the same.
 */

function rateLimit({ windowMs = 60_000, max = 300, message, keyGenerator } = {}) {
  const hits = new Map(); // key -> { count, resetAt }

  // Periodically purge expired buckets so the map can't grow unbounded.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  if (timer.unref) timer.unref();

  const keyFn = keyGenerator || ((req) => req.ip || req.headers['x-forwarded-for'] || 'global');

  return function (req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    let bucket = hits.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      hits.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      const msg = message || 'You have made too many requests. Please slow down and try again shortly.';
      // Self-contained response: this middleware may run before view locals are
      // set, so we avoid rendering an EJS template here.
      if (req.accepts('html')) {
        return res.status(429).type('html').send(
          `<!doctype html><meta charset="utf-8"><title>Too many requests</title>
           <div style="font-family:system-ui,sans-serif;max-width:480px;margin:12vh auto;text-align:center;color:#1e293b">
             <div style="font-size:56px;font-weight:800;color:#4f46e5">429</div>
             <h1>Too many requests</h1><p style="color:#64748b">${msg}</p>
             <p style="color:#94a3b8">Retry after about ${retryAfter}s.</p>
           </div>`
        );
      }
      return res.status(429).json({ error: msg, retry_after: retryAfter });
    }
    next();
  };
}

module.exports = rateLimit;
