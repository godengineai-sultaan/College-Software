'use strict';

/**
 * Aggregation queries for the dashboard (M7) and reports.
 * Every function accepts an optional branchId to honour branch scoping.
 * "Net Collection = Collections − Expenses" per the brain chart.
 */

const db = require('../db/connection');

function branchClause(alias, branchId, params) {
  if (branchId) { params.push(branchId); return ` AND ${alias}.branch_id = ?`; }
  return '';
}

const Stats = {
  collections({ branchId, from, to } = {}) {
    const params = [];
    let sql = `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM receipts WHERE status='active'`;
    sql += branchClause('receipts', branchId, params);
    if (from) { sql += ' AND paid_on >= ?'; params.push(from); }
    if (to) { sql += ' AND paid_on <= ?'; params.push(to); }
    return db.get(sql, params);
  },

  expenses({ branchId, from, to } = {}) {
    const params = [];
    let sql = `SELECT COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM expenses WHERE 1=1`;
    sql += branchClause('expenses', branchId, params);
    if (from) { sql += ' AND expense_date >= ?'; params.push(from); }
    if (to) { sql += ' AND expense_date <= ?'; params.push(to); }
    return db.get(sql, params);
  },

  /** Total outstanding dues across live students (recorded late fee). */
  outstanding({ branchId } = {}) {
    const params = [];
    let sql = `
      SELECT COALESCE(SUM(sf.amount - sf.discount + sf.late_fee - sf.paid_amount),0) AS total
        FROM student_fees sf
        JOIN students s ON s.id = sf.student_id
       WHERE s.deleted_at IS NULL AND sf.status != 'paid' AND sf.status != 'waived'`;
    if (branchId) { sql += ' AND s.branch_id = ?'; params.push(branchId); }
    return db.get(sql, params).total;
  },

  studentCount({ branchId } = {}) {
    const params = [];
    let sql = `SELECT COUNT(*) AS c FROM students WHERE deleted_at IS NULL`;
    if (branchId) { sql += ' AND branch_id = ?'; params.push(branchId); }
    return db.get(sql, params).c;
  },

  feeStatusBreakdown({ branchId } = {}) {
    const params = [];
    let sql = `
      SELECT sf.status, COUNT(*) AS c
        FROM student_fees sf JOIN students s ON s.id = sf.student_id
       WHERE s.deleted_at IS NULL`;
    if (branchId) { sql += ' AND s.branch_id = ?'; params.push(branchId); }
    sql += ' GROUP BY sf.status';
    const rows = db.all(sql, params);
    const out = { unpaid: 0, partial: 0, paid: 0, waived: 0 };
    rows.forEach((r) => { out[r.status] = r.c; });
    return out;
  },

  paymentModeDistribution({ branchId, from, to } = {}) {
    const params = [];
    let sql = `SELECT payment_mode, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count FROM receipts WHERE status='active'`;
    sql += branchClause('receipts', branchId, params);
    if (from) { sql += ' AND paid_on >= ?'; params.push(from); }
    if (to) { sql += ' AND paid_on <= ?'; params.push(to); }
    sql += ' GROUP BY payment_mode ORDER BY total DESC';
    return db.all(sql, params);
  },

  /** Monthly collection totals for a year (array of 12). */
  monthlyCollection({ branchId, year } = {}) {
    const params = [];
    let sql = `
      SELECT substr(paid_on, 1, 7) AS ym, COALESCE(SUM(amount),0) AS total
        FROM receipts WHERE status='active'`;
    sql += branchClause('receipts', branchId, params);
    if (year) { sql += ` AND substr(paid_on,1,4) = ?`; params.push(String(year)); }
    sql += ' GROUP BY ym ORDER BY ym';
    return db.all(sql, params);
  },

  /** Course-wise collection totals. */
  collectionByCourse({ branchId } = {}) {
    const params = [];
    let sql = `
      SELECT s.course_name AS course, COALESCE(SUM(r.amount),0) AS total, COUNT(r.id) AS receipts
        FROM receipts r JOIN students s ON s.id = r.student_id
       WHERE r.status='active'`;
    if (branchId) { sql += ' AND r.branch_id = ?'; params.push(branchId); }
    sql += ' GROUP BY s.course_name ORDER BY total DESC';
    return db.all(sql, params);
  },

  /** Per-branch comparison (collections, expenses, students). */
  branchComparison() {
    return db.all(`
      SELECT b.id, b.branch_code, b.name,
        (SELECT COALESCE(SUM(amount),0) FROM receipts r WHERE r.branch_id=b.id AND r.status='active') AS collected,
        (SELECT COALESCE(SUM(amount),0) FROM expenses e WHERE e.branch_id=b.id) AS spent,
        (SELECT COUNT(*) FROM students s WHERE s.branch_id=b.id AND s.deleted_at IS NULL) AS students
      FROM branches b ORDER BY b.branch_code`);
  },

  /** Students with outstanding dues (defaulters). */
  defaulters({ branchId, limit = 50 } = {}) {
    const params = [];
    let sql = `
      SELECT s.id, s.unique_id, s.name, s.course_name, s.semester, s.phone, s.branch_id, b.branch_code,
             SUM(sf.amount - sf.discount + sf.late_fee - sf.paid_amount) AS due
        FROM student_fees sf
        JOIN students s ON s.id = sf.student_id
        LEFT JOIN branches b ON b.id = s.branch_id
       WHERE s.deleted_at IS NULL AND sf.status != 'paid' AND sf.status != 'waived'`;
    if (branchId) { sql += ' AND s.branch_id = ?'; params.push(branchId); }
    sql += ' GROUP BY s.id HAVING due > 0.5 ORDER BY due DESC LIMIT ?';
    params.push(limit);
    return db.all(sql, params);
  },

  recentReceipts({ branchId, limit = 8 } = {}) {
    const params = [];
    let sql = `
      SELECT r.id, r.receipt_no, r.amount, r.payment_mode, r.paid_on, r.cross_branch,
             s.name AS student_name, s.unique_id AS student_uid
        FROM receipts r JOIN students s ON s.id = r.student_id
       WHERE r.status='active'`;
    if (branchId) { sql += ' AND r.branch_id = ?'; params.push(branchId); }
    sql += ' ORDER BY r.id DESC LIMIT ?';
    params.push(limit);
    return db.all(sql, params);
  },

  todayRange() {
    const t = new Date().toISOString().slice(0, 10);
    return { from: t, to: t };
  },

  monthRange() {
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    return { from: `${ym}-01`, to: `${ym}-31` };
  },
};

module.exports = Stats;
