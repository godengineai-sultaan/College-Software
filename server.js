'use strict';

/**
 * College Software — server entry point.
 *
 *   npm run setup   # create the database and demo data (first time only)
 *   npm start       # launch the web server
 *
 * Then open http://localhost:3000
 */

const fs = require('fs');
const config = require('./src/config');

// Friendly guard: make sure the database has been set up.
if (!fs.existsSync(config.db.file)) {
  console.log('\n⚠  Database not found. Running first-time setup...\n');
  require('./src/db/migrate')();
  require('./src/db/seed')();
  console.log('');
}

const app = require('./src/app');

const server = app.listen(config.port, () => {
  console.log('\n============================================================');
  console.log('  College Software is running');
  console.log(`  ➜  http://localhost:${config.port}`);
  console.log(`  Environment: ${config.env}`);
  console.log('============================================================\n');
});

// Graceful shutdown.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n${signal} received — shutting down.`);
    server.close(() => process.exit(0));
  });
}

module.exports = server;
