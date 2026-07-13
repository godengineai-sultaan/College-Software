'use strict';

const db = require('../db/connection');
const IdGen = require('../services/idgen');
const Branch = require('./branch');

/** M6: Expense management with voucher numbers, categories and bill upload. */
const Expense = {
  _filter({ branchId, category, from, to, search } = {}) {
    const where = [];
    const params = [];
    if (branchId) { where.push('e.branch_id = ?'); params.push(branchId); }
    if (category) { where.push('e.category = ?'); params.push(category); }
    if (from) { where.push('e.expense_date >= ?'); params.push(from); }
    if (to) { where.push('e.expense_date <= ?'); params.push(to); }
    if (search) { where.push('(e.voucher_no LIKE ? OR e.paid_to LIKE ? OR e.notes LIKE ?)'); const q = `%${search}%`; params.push(q, q, q); }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  },

  all(opts = {}) {
    const { clause, params } = this._filter(opts);
    const limit = opts.limit || 20;
    const offset = opts.offset || 0;
    return db.all(`
      SELECT e.*, b.branch_code, u.name AS created_by_name
        FROM expenses e
        LEFT JOIN branches b ON b.id = e.branch_id
        LEFT JOIN users u ON u.id = e.created_by
        ${clause} ORDER BY e.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  },

  count(opts = {}) {
    const { clause, params } = this._filter(opts);
    return db.get(`SELECT COUNT(*) AS c FROM expenses e ${clause}`, params).c;
  },

  sum(opts = {}) {
    const { clause, params } = this._filter(opts);
    return db.get(`SELECT COALESCE(SUM(e.amount),0) AS total FROM expenses e ${clause}`, params).total;
  },

  findById(id) {
    return db.get(`
      SELECT e.*, b.branch_code, u.name AS created_by_name
        FROM expenses e LEFT JOIN branches b ON b.id = e.branch_id
        LEFT JOIN users u ON u.id = e.created_by WHERE e.id = ?`, [id]);
  },

  create(data, createdBy = null) {
    const branch = Branch.findById(data.branch_id);
    const code = branch ? branch.branch_code : 'A';
    const voucherNo = data.voucher_no || IdGen.voucher(code);
    const r = db.run(
      `INSERT INTO expenses (voucher_no, category, sub_category, amount, branch_id, bill_attachment, expense_date, paid_to, payment_mode, notes, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [voucherNo, data.category || null, data.sub_category || null, data.amount || 0, data.branch_id,
       data.bill_attachment || null, data.expense_date || new Date().toISOString().slice(0, 10),
       data.paid_to || null, data.payment_mode || 'cash', data.notes || null, createdBy]);
    return { id: Number(r.lastInsertRowid), voucher_no: voucherNo };
  },

  update(id, data) {
    const fields = ['category', 'sub_category', 'amount', 'bill_attachment', 'expense_date', 'paid_to', 'payment_mode', 'notes'];
    const sets = [];
    const params = [];
    for (const f of fields) if (data[f] !== undefined) { sets.push(`${f} = ?`); params.push(data[f]); }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`);
    params.push(id);
    db.run(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  remove(id) {
    db.run('DELETE FROM expenses WHERE id = ?', [id]);
  },

  categories() {
    return db.all('SELECT DISTINCT category FROM expenses WHERE category IS NOT NULL ORDER BY category');
  },
};

module.exports = Expense;
