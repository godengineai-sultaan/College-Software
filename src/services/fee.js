'use strict';

/**
 * Fee engine — the money logic in one place.
 *
 *  - assignStructureToStudent(): create ledger lines from a fee structure.
 *  - computeLine(): net & balance for a ledger row (with live late fee).
 *  - summary(): totals for a student (charged, discount, late, paid, due).
 *  - allocate(): spread a payment across outstanding heads (highest-priority
 *    first), returning the head-wise allocation used to build receipt items.
 */

const db = require('../db/connection');
const StudentFee = require('../models/studentFee');
const FeeStructure = require('../models/feeStructure');
const Setting = require('../models/setting');
const { daysBetween } = require('../utils/helpers');

const Fee = {
  /** Live late fee for a ledger line based on due date and settings. */
  lateFeeFor(line, asOf = new Date()) {
    if (!Setting.bool('late_fee_enabled')) return 0;
    if (!line.due_date) return Number(line.late_fee) || 0;
    const overdueDays = daysBetween(line.due_date, asOf);
    if (overdueDays <= 0) return Number(line.late_fee) || 0;
    // Prefer a per-structure rate, else the global default.
    let perDay = 0;
    if (line.structure_id) {
      const st = FeeStructure.findById(line.structure_id);
      perDay = st && st.late_fee_per_day ? Number(st.late_fee_per_day) : 0;
    }
    if (!perDay) perDay = Setting.num('late_fee_per_day', 0);
    const max = Setting.num('late_fee_max', 0);
    let fee = overdueDays * perDay;
    if (max > 0) fee = Math.min(fee, max);
    // Never less than an already-recorded late fee.
    return Math.max(fee, Number(line.late_fee) || 0);
  },

  /** Compute net / balance / status for one ledger line. */
  computeLine(line, asOf = new Date()) {
    const amount = Number(line.amount) || 0;
    const discount = Number(line.discount) || 0;
    const lateFee = this.lateFeeFor(line, asOf);
    const paid = Number(line.paid_amount) || 0;
    const net = Math.max(0, amount - discount + lateFee);
    const balance = Math.max(0, net - paid);
    let status = 'unpaid';
    if (net <= 0) status = 'waived';
    else if (balance <= 0.001) status = 'paid';
    else if (paid > 0) status = 'partial';
    return { ...line, amount, discount, late_fee: lateFee, paid, net, balance, status };
  },

  /** All ledger lines for a student, computed. */
  linesForStudent(studentId, asOf = new Date()) {
    return StudentFee.forStudent(studentId).map((l) => this.computeLine(l, asOf));
  },

  /** Aggregate fee summary for a student. */
  summary(studentId, asOf = new Date()) {
    const lines = this.linesForStudent(studentId, asOf);
    const acc = { charged: 0, discount: 0, late_fee: 0, paid: 0, net: 0, due: 0, lines };
    for (const l of lines) {
      acc.charged += l.amount;
      acc.discount += l.discount;
      acc.late_fee += l.late_fee;
      acc.paid += l.paid;
      acc.net += l.net;
      acc.due += l.balance;
    }
    return acc;
  },

  /**
   * Create ledger lines for a student from the fee structure of their
   * course/semester. Skips lines already assigned. Returns count created.
   */
  assignStructureToStudent(student, { semester, academicYear } = {}) {
    const sem = semester || student.semester;
    const rows = FeeStructure.forCourseSemester(student.course_id, sem, academicYear);
    let created = 0;
    for (const st of rows) {
      if (StudentFee.existsForStructure(student.id, st.id)) continue;
      StudentFee.create({
        student_id: student.id,
        structure_id: st.id,
        fee_head: st.fee_head,
        amount: st.amount,
        academic_year: st.academic_year,
        semester: st.semester,
        due_date: st.due_date,
      });
      created += 1;
    }
    return created;
  },

  /**
   * Allocate a lump-sum payment across a student's outstanding lines,
   * oldest due date first, then largest balance.
   *
   * Returns { allocation, unallocated } where each allocation entry is
   * { sf_id, fee_head, amount, late_fee } — `late_fee` is the line's live
   * computed late fee (absolute) so the caller can persist it on the line.
   */
  allocate(studentId, payAmount, asOf = new Date()) {
    let remaining = round2(Number(payAmount) || 0);
    const lines = this.linesForStudent(studentId, asOf)
      .filter((l) => l.balance > 0)
      .sort((a, b) => {
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const dbb = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        if (da !== dbb) return da - dbb;
        return b.balance - a.balance;
      });
    const allocation = [];
    for (const l of lines) {
      if (remaining <= 0.001) break;
      const take = round2(Math.min(remaining, l.balance));
      allocation.push({
        sf_id: l.id,
        fee_head: l.fee_head,
        amount: take,
        late_fee: l.late_fee,   // absolute live late fee to persist on this line
      });
      remaining = round2(remaining - take);
    }
    return { allocation, unallocated: remaining };
  },
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = Fee;
