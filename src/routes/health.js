'use strict';

/**
 * Health & readiness endpoints for load balancers / uptime monitors.
 *   GET /health   — liveness + a quick DB ping
 *   GET /healthz  — alias
 */

const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const pkg = require('../../package.json');

const startedAt = Date.now();

function health(req, res) {
  let dbOk = true;
  try {
    db.get('SELECT 1 AS ok');
  } catch (e) {
    dbOk = false;
  }
  const body = {
    status: dbOk ? 'ok' : 'degraded',
    service: pkg.name,
    version: pkg.version,
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    database: dbOk ? 'up' : 'down',
    timestamp: new Date().toISOString(),
  };
  res.status(dbOk ? 200 : 503).json(body);
}

router.get('/health', health);
router.get('/healthz', health);

module.exports = router;
