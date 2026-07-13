'use strict';

/**
 * Deletes the SQLite database file and rebuilds it from scratch, then re-seeds.
 * Useful during setup/testing. DESTRUCTIVE — removes all data.
 *
 *   npm run reset
 */

const fs = require('fs');
const config = require('../config');

for (const suffix of ['', '-wal', '-shm']) {
  const f = config.db.file + suffix;
  if (fs.existsSync(f)) {
    fs.unlinkSync(f);
    console.log('✗ removed', f);
  }
}

require('./migrate')();
require('./seed')();
