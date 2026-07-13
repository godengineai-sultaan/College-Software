'use strict';

const db = require('../db/connection');

/**
 * Student fee ledger — the per-student, per-head amounts owed and paid.
 * `net = amount - discount + late_fee`; `balance = net - paid_amount`.
 */
const StudentFee = {
  forStudent(studentId) {
    return db.all(`SELECT * FROM student_fees WHERE student_id = ? ORDER BY semester, fee_head`, [studentId]);
  },

  findById(id) {
    return db.get('SELECT * FROM student_fees WHERE id = ?', [id]);
  },

  create({ student_id, structure_id, fee_head, amount, discount = 0, late_fee = 0, academic_year, semester, due_date }) {
    const r = db.run(
      `INSERT INTO student_fees (student_id, structure_id, fee_head, amount, discount, late_fee, academic_year, semester, due_date, status)
       VALUES (?,?,?,?,?,?,?,?,?, 'unpaid')`,
      [student_id, structure_id || null, fee_head, amount || 0, discount || 0, late_fee || 0, academic_year || null, semester || null, due_date || null]);
    return Number(r.lastInsertRowid);
  },

  /** Does a student already have a ledger line for this structure row? */
  existsForStructure(studentId, structureId) {
    if (!structureId) return false;
    return !!db.get('SELECT id FROM student_fees WHERE student_id = ? AND structure_id = ?', [studentId, structureId]);
  },

  /** Apply a payment to a single ledger line and recompute its status. */
  applyPayment(id, payAmount, discountAmount = 0, lateFeeAmount = 0) {
    const row = this.findById(id);
    if (!row) return;
    const paid = Number(row.paid_amount) + Number(payAmount || 0);
    const discount = Number(row.discount) + Number(discountAmount || 0);
    const lateFee = Number(row.late_fee) + Number(lateFeeAmount || 0);
    const net = Number(row.amount) - discount + lateFee;
    let status = 'partial';
    if (paid <= 0) status = 'unpaid';
    else if (paid >= net - 0.001) status = 'paid';
    db.run(`UPDATE student_fees SET paid_amount = ?, discount = ?, late_fee = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [paid, discount, lateFee, status, id]);
  },

  /**
   * Record a collection against a line: add `pay` to paid_amount and SET the
   * line's late_fee to the given absolute value, then recompute status.
   */
  recordCollection(id, { pay = 0, lateFee = null } = {}) {
    const row = this.findById(id);
    if (!row) return;
    const paid = Number(row.paid_amount) + Number(pay || 0);
    const late = lateFee === null ? Number(row.late_fee) : Number(lateFee);
    const net = Number(row.amount) - Number(row.discount) + late;
    let status = 'unpaid';
    if (net <= 0) status = 'waived';
    else if (paid >= net - 0.001) status = 'paid';
    else if (paid > 0) status = 'partial';
    db.run(`UPDATE student_fees SET paid_amount = ?, late_fee = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [paid, late, status, id]);
  },

  setDiscount(id, discountAmount) {
    const row = this.findById(id);
    if (!row) return;
    const net = Number(row.amount) - Number(discountAmount) + Number(row.late_fee);
    const paid = Number(row.paid_amount);
    let status = 'partial';
    if (paid <= 0) status = paid >= net ? 'paid' : 'unpaid';
    else if (paid >= net - 0.001) status = 'paid';
    if (net <= 0) status = 'waived';
    db.run(`UPDATE student_fees SET discount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [discountAmount, status, id]);
  },

  remove(id) {
    db.run('DELETE FROM student_fees WHERE id = ?', [id]);
  },
};

module.exports = StudentFee;
