'use strict';

/**
 * Audit logging (M9). Records who did what, when, from where, with before/after
 * values — as specified in the brain-chart schema.
 */

const db = require('../db/connection');

const Audit = {
  /**
   * @param {object} req      Express request (for the acting user + IP).
   * @param {string} action   INSERT | UPDATE | DELETE | LOGIN | LOGOUT | ...
   * @param {string} table    Affected table name.
   * @param {number} recordId Affected row id.
   * @param {object} [oldVal] Previous values.
   * @param {object} [newVal] New values.
   */
  log(req, action, table, recordId, oldVal, newVal) {
    try {
      const user = req && req.user;
      db.run(
        `INSERT INTO audit_logs (user_id, username, action, table_name, record_id, old_value, new_value, ip_address, branch_id)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          user ? user.id : null,
          user ? user.username : 'system',
          action,
          table || null,
          recordId || null,
          oldVal ? JSON.stringify(oldVal) : null,
          newVal ? JSON.stringify(newVal) : null,
          req ? (req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || null) : null,
          user ? user.branch_id : null,
        ]
      );
    } catch (e) {
      // Never let audit failure break the main action.
      console.error('audit log failed:', e.message);
    }
  },

  list({ table, userId, action, limit = 100, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (table) { where.push('table_name = ?'); params.push(table); }
    if (userId) { where.push('user_id = ?'); params.push(userId); }
    if (action) { where.push('action = ?'); params.push(action); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.all(`SELECT * FROM audit_logs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  },

  count({ table, userId, action } = {}) {
    const where = [];
    const params = [];
    if (table) { where.push('table_name = ?'); params.push(table); }
    if (userId) { where.push('user_id = ?'); params.push(userId); }
    if (action) { where.push('action = ?'); params.push(action); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.get(`SELECT COUNT(*) AS c FROM audit_logs ${clause}`, params).c;
  },
};

module.exports = Audit;
