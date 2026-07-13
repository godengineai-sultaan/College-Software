'use strict';

/**
 * Database connection.
 *
 * We use SQLite through Node's built-in `node:sqlite` module — a single-file,
 * zero-configuration database that ships with Node itself. That means there is
 * NOTHING to compile or install for the database: `node server.js` just works
 * on any machine with a recent Node.js.
 *
 * To move to MySQL/PostgreSQL later, only this file and the models' SQL need to
 * change; the rest of the application talks to the helpers exported below.
 */

// Silence only the "SQLite is experimental" notice so the client's console
// stays clean. All other Node warnings are left untouched.
const _emit = process.emit;
process.emit = function (name, data, ...rest) {
  if (
    name === 'warning' &&
    data &&
    data.name === 'ExperimentalWarning' &&
    typeof data.message === 'string' &&
    data.message.includes('SQLite')
  ) {
    return false;
  }
  return _emit.call(this, name, data, ...rest);
};

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

// Ensure the data directory exists.
const dataDir = path.dirname(config.db.file);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(config.db.file);

// Pragmas for reliability and sensible foreign-key behaviour.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/**
 * node:sqlite (like better-sqlite3) refuses `undefined` and JavaScript booleans
 * as bound parameters. Normalising here means every model can pass values
 * freely without sprinkling `? 1 : 0` and `?? null` everywhere.
 */
function normalize(params) {
  const arr = Array.isArray(params) ? params : [params];
  return arr.map((v) => {
    if (v === undefined) return null;
    if (v === true) return 1;
    if (v === false) return 0;
    return v;
  });
}

const helpers = {
  db,

  /** Run a statement that changes data (INSERT/UPDATE/DELETE). */
  run(sql, params = []) {
    return db.prepare(sql).run(...normalize(params));
  },

  /** Fetch a single row (or undefined). */
  get(sql, params = []) {
    return db.prepare(sql).get(...normalize(params));
  },

  /** Fetch all matching rows. */
  all(sql, params = []) {
    return db.prepare(sql).all(...normalize(params));
  },

  /** Execute raw SQL that may contain multiple statements (e.g. the schema). */
  exec(sql) {
    return db.exec(sql);
  },

  /**
   * Run `fn` inside a transaction. Commits on success, rolls back on any
   * error, then re-throws. Essential for money operations (receipt counter +
   * receipt + ledger update must all succeed together).
   */
  tx(fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch (_) { /* ignore */ }
      throw err;
    }
  },
};

module.exports = helpers;
