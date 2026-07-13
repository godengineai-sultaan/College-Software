'use strict';

/**
 * Gap-free, race-safe auto-ID generation using an atomic counter row.
 *
 * Formats (from the brain chart):
 *   Student : COL-A-26-0001
 *   Receipt : REC-A-26-000001
 *   Voucher : VCH-A-26-0001
 *   ExamForm: EXF-A-26-0001
 *
 * A single counter per (kind, branch, year) guarantees uniqueness even under
 * concurrent inserts — unlike MAX(id)+1 or COUNT(*), which can collide.
 */

const db = require('../db/connection');
const Setting = require('../models/setting');

function bump(scope) {
  db.run(
    `INSERT INTO counters (scope, value) VALUES (?, 1)
     ON CONFLICT(scope) DO UPDATE SET value = value + 1`,
    [scope]
  );
  return db.get('SELECT value FROM counters WHERE scope = ?', [scope]).value;
}

function yy(date = new Date()) {
  return String(date.getFullYear()).slice(-2);
}

const IdGen = {
  /** COL-A-26-0001 */
  student(branchCode, date = new Date()) {
    const prefix = Setting.get('student_id_prefix') || 'COL';
    const y = yy(date);
    const n = bump(`student:${branchCode}:${y}`);
    return `${prefix}-${branchCode}-${y}-${String(n).padStart(4, '0')}`;
  },

  /** REC-A-26-000001 */
  receipt(branchCode, date = new Date()) {
    const prefix = Setting.get('receipt_no_prefix') || 'REC';
    const y = yy(date);
    const n = bump(`receipt:${branchCode}:${y}`);
    return `${prefix}-${branchCode}-${y}-${String(n).padStart(6, '0')}`;
  },

  /** VCH-A-26-0001 */
  voucher(branchCode, date = new Date()) {
    const prefix = Setting.get('voucher_no_prefix') || 'VCH';
    const y = yy(date);
    const n = bump(`voucher:${branchCode}:${y}`);
    return `${prefix}-${branchCode}-${y}-${String(n).padStart(4, '0')}`;
  },

  /** EXF-A-26-0001 */
  examForm(branchCode, date = new Date()) {
    const prefix = Setting.get('examform_no_prefix') || 'EXF';
    const y = yy(date);
    const n = bump(`examform:${branchCode}:${y}`);
    return `${prefix}-${branchCode}-${y}-${String(n).padStart(4, '0')}`;
  },

  bump,
};

module.exports = IdGen;
