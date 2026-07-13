'use strict';

/**
 * Applies the database schema (src/db/schema.sql).
 * Safe to run repeatedly — every statement uses "IF NOT EXISTS".
 *
 *   npm run migrate
 */

const fs = require('fs');
const path = require('path');
const db = require('./connection');
const config = require('../config');

function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(sql);
  console.log('✓ Database schema applied →', config.db.file);
}

if (require.main === module) {
  try {
    migrate();
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  }
}

module.exports = migrate;
