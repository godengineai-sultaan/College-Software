'use strict';

/**
 * Test bootstrap — must be required BEFORE any src module so the database
 * connection opens against a throwaway temp database (never the real one).
 * Builds a fresh schema + demo data quietly.
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key';
if (!process.env.DATABASE_FILE) {
  process.env.DATABASE_FILE = path.join(
    os.tmpdir(),
    `wschools-test-${process.pid}-${Date.now()}.sqlite`
  );
}

// Build the schema + seed, silencing the seed's console output.
const origLog = console.log;
console.log = () => {};
try {
  require('../src/db/migrate')();
  require('../src/db/seed')();
} finally {
  console.log = origLog;
}

function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = process.env.DATABASE_FILE + suffix;
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { /* ignore */ }
  }
}
process.on('exit', cleanup);

module.exports = { dbFile: process.env.DATABASE_FILE, cleanup };
