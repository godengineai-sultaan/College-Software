'use strict';

const db = require('../db/connection');

/** M3: Discount request/approval workflow. */
const Discount = {
  all({ branchId, status, limit = 50, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (branchId) { where.push('d.branch_id = ?'); params.push(branchId); }
    if (status) { where.push('d.status = ?'); params.push(status); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.all(`
      SELECT d.*, s.name AS student_name, s.unique_id AS student_uid,
             ru.name AS requested_by_name, au.name AS approved_by_name
        FROM discounts d
        LEFT JOIN students s ON s.id = d.student_id
        LEFT JOIN users ru ON ru.id = d.requested_by
        LEFT JOIN users au ON au.id = d.approved_by
        ${clause} ORDER BY d.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  },

  count({ branchId, status } = {}) {
    const where = [];
    const params = [];
    if (branchId) { where.push('branch_id = ?'); params.push(branchId); }
    if (status) { where.push('status = ?'); params.push(status); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.get(`SELECT COUNT(*) AS c FROM discounts ${clause}`, params).c;
  },

  findById(id) {
    return db.get(`
      SELECT d.*, s.name AS student_name, s.unique_id AS student_uid
        FROM discounts d LEFT JOIN students s ON s.id = d.student_id WHERE d.id = ?`, [id]);
  },

  create({ student_id, sf_id, fee_head, amount, reason, status = 'pending', branch_id, requested_by }) {
    const r = db.run(
      `INSERT INTO discounts (student_id, sf_id, fee_head, amount, reason, status, branch_id, requested_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [student_id, sf_id || null, fee_head || null, amount || 0, reason || null, status, branch_id || null, requested_by || null]);
    return Number(r.lastInsertRowid);
  },

  decide(id, status, approvedBy) {
    db.run(`UPDATE discounts SET status = ?, approved_by = ?, decided_at = datetime('now') WHERE id = ?`,
      [status, approvedBy || null, id]);
  },
};

module.exports = Discount;
