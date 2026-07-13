'use strict';

const db = require('../db/connection');

const Receipt = {
  _filter({ branchId, studentId, mode, crossBranch, from, to, search, status } = {}) {
    const where = [];
    const params = [];
    if (branchId) { where.push('r.branch_id = ?'); params.push(branchId); }
    if (studentId) { where.push('r.student_id = ?'); params.push(studentId); }
    if (mode) { where.push('r.payment_mode = ?'); params.push(mode); }
    if (crossBranch !== undefined) { where.push('r.cross_branch = ?'); params.push(crossBranch ? 1 : 0); }
    if (status) { where.push('r.status = ?'); params.push(status); }
    if (from) { where.push('r.paid_on >= ?'); params.push(from); }
    if (to) { where.push('r.paid_on <= ?'); params.push(to); }
    if (search) { where.push('(r.receipt_no LIKE ? OR s.name LIKE ? OR s.unique_id LIKE ?)'); const q = `%${search}%`; params.push(q, q, q); }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  },

  all(opts = {}) {
    const { clause, params } = this._filter(opts);
    const limit = opts.limit || 20;
    const offset = opts.offset || 0;
    return db.all(`
      SELECT r.*, s.name AS student_name, s.unique_id AS student_uid,
             b.branch_code AS collect_branch, u.name AS collected_by_name
        FROM receipts r
        LEFT JOIN students s ON s.id = r.student_id
        LEFT JOIN branches b ON b.id = r.branch_id
        LEFT JOIN users u ON u.id = r.collected_by
        ${clause}
        ORDER BY r.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  },

  count(opts = {}) {
    const { clause, params } = this._filter(opts);
    return db.get(`
      SELECT COUNT(*) AS c FROM receipts r
      LEFT JOIN students s ON s.id = r.student_id ${clause}`, params).c;
  },

  sum(opts = {}) {
    const { clause, params } = this._filter(opts);
    return db.get(`
      SELECT COALESCE(SUM(r.amount),0) AS total FROM receipts r
      LEFT JOIN students s ON s.id = r.student_id ${clause}`, params).total;
  },

  findById(id) {
    return db.get(`
      SELECT r.*, s.name AS student_name, s.unique_id AS student_uid, s.course_name, s.semester, s.phone AS student_phone,
             b.branch_code AS collect_branch, b.name AS collect_branch_name,
             sb.branch_code AS student_branch_code, u.name AS collected_by_name
        FROM receipts r
        LEFT JOIN students s ON s.id = r.student_id
        LEFT JOIN branches b ON b.id = r.branch_id
        LEFT JOIN branches sb ON sb.id = r.student_branch_id
        LEFT JOIN users u ON u.id = r.collected_by
        WHERE r.id = ?`, [id]);
  },

  findByNo(no) {
    const row = db.get('SELECT id FROM receipts WHERE receipt_no = ?', [no]);
    return row ? this.findById(row.id) : null;
  },

  items(receiptId) {
    return db.all('SELECT * FROM receipt_items WHERE receipt_id = ? ORDER BY id', [receiptId]);
  },

  forStudent(studentId) {
    return db.all(`
      SELECT r.*, b.branch_code AS collect_branch
        FROM receipts r LEFT JOIN branches b ON b.id = r.branch_id
       WHERE r.student_id = ? ORDER BY r.id DESC`, [studentId]);
  },

  cancel(id) {
    db.run(`UPDATE receipts SET status = 'cancelled' WHERE id = ?`, [id]);
  },
};

module.exports = Receipt;
