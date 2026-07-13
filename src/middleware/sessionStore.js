'use strict';

/**
 * A tiny express-session store backed by our SQLite database.
 *
 * Using this instead of the default in-memory store means logins survive a
 * server restart and there is no extra dependency to install — it reuses the
 * `sessions` table from schema.sql.
 */

const db = require('../db/connection');

module.exports = function (session) {
  const Store = session.Store;

  class SqliteStore extends Store {
    constructor(options = {}) {
      super(options);
      // Occasionally purge expired rows.
      this._cleanup();
      this._timer = setInterval(() => this._cleanup(), 1000 * 60 * 60);
      if (this._timer.unref) this._timer.unref();
    }

    _cleanup() {
      try {
        db.run('DELETE FROM sessions WHERE expires_at < ?', [Date.now()]);
      } catch (e) {
        /* ignore cleanup errors */
      }
    }

    get(sid, cb) {
      try {
        const row = db.get('SELECT data, expires_at FROM sessions WHERE sid = ?', [sid]);
        if (!row) return cb(null, null);
        if (row.expires_at < Date.now()) {
          db.run('DELETE FROM sessions WHERE sid = ?', [sid]);
          return cb(null, null);
        }
        return cb(null, JSON.parse(row.data));
      } catch (err) {
        return cb(err);
      }
    }

    set(sid, sess, cb) {
      try {
        const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 1000 * 60 * 60 * 8;
        const expires = Date.now() + maxAge;
        db.run(
          `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
          [sid, JSON.stringify(sess), expires]
        );
        return cb ? cb(null) : null;
      } catch (err) {
        return cb ? cb(err) : null;
      }
    }

    touch(sid, sess, cb) {
      try {
        const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : 1000 * 60 * 60 * 8;
        db.run('UPDATE sessions SET expires_at = ? WHERE sid = ?', [Date.now() + maxAge, sid]);
        return cb ? cb(null) : null;
      } catch (err) {
        return cb ? cb(err) : null;
      }
    }

    destroy(sid, cb) {
      try {
        db.run('DELETE FROM sessions WHERE sid = ?', [sid]);
        return cb ? cb(null) : null;
      } catch (err) {
        return cb ? cb(err) : null;
      }
    }

    clear(cb) {
      try {
        db.run('DELETE FROM sessions');
        return cb ? cb(null) : null;
      } catch (err) {
        return cb ? cb(err) : null;
      }
    }
  }

  return SqliteStore;
};
