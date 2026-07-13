'use strict';

/**
 * M8 — Data Merge & Export.
 *
 * Produces the consolidated cross-branch dataset that management uses for
 * reconciliation: one 6-sheet Excel workbook plus individual CSVs. Because a
 * cross-branch receipt is always attributed to the COLLECTING branch, summing
 * per collecting-branch never double counts a payment.
 *
 * Branch scope is enforced server-side (req.branchScopeId); all-branch roles
 * may pass ?branch=ID and, for dated data (receipts/expenses), ?from=&to=.
 */

const db = require('../db/connection');
const excel = require('../utils/excel');
const csv = require('../utils/csv');
const Branch = require('../models/branch');
const Stats = require('../services/stats');
const { clean } = require('../utils/helpers');

/** Resolve the branch this export should be scoped to. */
function scope(req) {
  if (req.branchScopeId) return req.branchScopeId;
  const b = parseInt(req.query.branch, 10);
  return Number.isFinite(b) && b > 0 ? b : null;
}

function pickableBranches(req) {
  if (req.branchScopeId) {
    const b = Branch.findById(req.branchScopeId);
    return b ? [b] : [];
  }
  return Branch.all({ activeOnly: true });
}

/** Append `AND col >= ? / <= ?` for a date window and push params. */
function dateClause(col, from, to, params) {
  let sql = '';
  if (from) { sql += ` AND ${col} >= ?`; params.push(from); }
  if (to) { sql += ` AND ${col} <= ?`; params.push(to); }
  return sql;
}

// ---- Dataset builders (each returns { headers, rows }) ---------------------

function studentsData(branchId) {
  const params = [];
  let sql = `
    SELECT s.unique_id, s.name, COALESCE(c.name, s.course_name) AS course_name,
           s.semester, b.branch_code, s.phone, s.status
      FROM students s
      LEFT JOIN branches b ON b.id = s.branch_id
      LEFT JOIN courses  c ON c.id = s.course_id
     WHERE s.deleted_at IS NULL`;
  if (branchId) { sql += ' AND s.branch_id = ?'; params.push(branchId); }
  sql += ' ORDER BY s.unique_id';
  const rows = db.all(sql, params).map((r) => [
    r.unique_id, r.name, r.course_name || '', Number(r.semester) || 0,
    r.branch_code || '', r.phone || '', r.status,
  ]);
  return { headers: ['Student ID', 'Name', 'Course', 'Semester', 'Branch', 'Phone', 'Status'], rows };
}

function feeLedgerData(branchId) {
  const params = [];
  let sql = `
    SELECT s.unique_id, s.name, sf.fee_head, sf.amount, sf.discount, sf.late_fee, sf.paid_amount,
           (sf.amount - sf.discount + sf.late_fee - sf.paid_amount) AS balance, sf.status
      FROM student_fees sf
      JOIN students s ON s.id = sf.student_id
     WHERE s.deleted_at IS NULL`;
  if (branchId) { sql += ' AND s.branch_id = ?'; params.push(branchId); }
  sql += ' ORDER BY s.unique_id, sf.id';
  const rows = db.all(sql, params).map((r) => [
    r.unique_id, r.name, r.fee_head,
    Number(r.amount) || 0, Number(r.discount) || 0, Number(r.late_fee) || 0,
    Number(r.paid_amount) || 0, Number(r.balance) || 0, r.status,
  ]);
  return {
    headers: ['Student ID', 'Name', 'Fee Head', 'Amount', 'Discount', 'Late Fee', 'Paid', 'Balance', 'Status'],
    rows,
  };
}

function receiptsData(branchId, from, to) {
  const params = [];
  let sql = `
    SELECT r.receipt_no, r.paid_on, s.unique_id, s.name, r.amount, r.payment_mode,
           b.branch_code, r.cross_branch
      FROM receipts r
      JOIN students s ON s.id = r.student_id
      LEFT JOIN branches b ON b.id = r.branch_id
     WHERE r.status = 'active'`;
  if (branchId) { sql += ' AND r.branch_id = ?'; params.push(branchId); }
  sql += dateClause('r.paid_on', from, to, params);
  sql += ' ORDER BY r.id';
  const rows = db.all(sql, params).map((r) => [
    r.receipt_no, r.paid_on, r.unique_id, r.name, Number(r.amount) || 0,
    r.payment_mode, r.branch_code || '', r.cross_branch ? 'Yes' : 'No',
  ]);
  return {
    headers: ['Receipt No', 'Date', 'Student ID', 'Student Name', 'Amount', 'Payment Mode', 'Collecting Branch', 'Cross Branch'],
    rows,
  };
}

function expensesData(branchId, from, to) {
  const params = [];
  let sql = `
    SELECT e.voucher_no, e.expense_date, e.category, e.sub_category, e.paid_to, e.amount, b.branch_code
      FROM expenses e
      LEFT JOIN branches b ON b.id = e.branch_id
     WHERE 1=1`;
  if (branchId) { sql += ' AND e.branch_id = ?'; params.push(branchId); }
  sql += dateClause('e.expense_date', from, to, params);
  sql += ' ORDER BY e.id';
  const rows = db.all(sql, params).map((r) => [
    r.voucher_no, r.expense_date, r.category || '', r.sub_category || '',
    r.paid_to || '', Number(r.amount) || 0, r.branch_code || '',
  ]);
  return {
    headers: ['Voucher No', 'Date', 'Category', 'Sub Category', 'Paid To', 'Amount', 'Branch'],
    rows,
  };
}

function examFormsData(branchId) {
  const params = [];
  let sql = `
    SELECT ef.form_no, s.unique_id, ef.exam_type, ef.session, ef.semester, ef.fee_amount, ef.status
      FROM exam_forms ef
      JOIN students s ON s.id = ef.student_id
     WHERE 1=1`;
  if (branchId) { sql += ' AND ef.branch_id = ?'; params.push(branchId); }
  sql += ' ORDER BY ef.id';
  const rows = db.all(sql, params).map((r) => [
    r.form_no, r.unique_id, r.exam_type, r.session || '',
    Number(r.semester) || 0, Number(r.fee_amount) || 0, r.status,
  ]);
  return {
    headers: ['Form No', 'Student ID', 'Exam Type', 'Session', 'Semester', 'Fee Amount', 'Status'],
    rows,
  };
}

/** Per-branch reconciliation summary (no double counting of cross-branch receipts). */
function reconciliationData(branchId, from, to) {
  const branches = branchId
    ? [Branch.findById(branchId)].filter(Boolean)
    : Branch.all({});
  const rows = [];
  const totals = { col: 0, exp: 0, xCount: 0, xAmt: 0, out: 0 };

  branches.forEach((b) => {
    const col = Stats.collections({ branchId: b.id, from, to }).total;
    const exp = Stats.expenses({ branchId: b.id, from, to }).total;
    const out = Stats.outstanding({ branchId: b.id });

    const xp = [b.id];
    let xsql = `SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS amt
                  FROM receipts WHERE status='active' AND cross_branch = 1 AND branch_id = ?`;
    xsql += dateClause('paid_on', from, to, xp);
    const x = db.get(xsql, xp);

    rows.push([
      `Branch ${b.branch_code} — ${b.name}`,
      Number(col) || 0, Number(exp) || 0, Number(col - exp) || 0,
      Number(x.c) || 0, Number(x.amt) || 0, Number(out) || 0,
    ]);
    totals.col += col; totals.exp += exp;
    totals.xCount += Number(x.c) || 0; totals.xAmt += Number(x.amt) || 0; totals.out += out;
  });

  rows.push([
    branchId ? 'TOTAL (scoped)' : 'TOTAL (all branches)',
    Number(totals.col) || 0, Number(totals.exp) || 0, Number(totals.col - totals.exp) || 0,
    totals.xCount, Number(totals.xAmt) || 0, Number(totals.out) || 0,
  ]);

  return {
    headers: ['Branch', 'Total Collected', 'Total Expenses', 'Net', 'Cross-Branch Receipts', 'Cross-Branch Amount', 'Outstanding'],
    rows,
  };
}

const ExportController = {
  // ---- Landing page --------------------------------------------------------
  index(req, res) {
    const branchId = scope(req);
    res.render('exports/index', {
      title: 'Data Merge & Export',
      branchId,
      from: clean(req.query.from),
      to: clean(req.query.to),
      branches: pickableBranches(req),
    });
  },

  // ---- Consolidated 6-sheet workbook --------------------------------------
  consolidated(req, res) {
    const branchId = scope(req);
    const from = clean(req.query.from);
    const to = clean(req.query.to);

    const students = studentsData(branchId);
    const ledger = feeLedgerData(branchId);
    const receipts = receiptsData(branchId, from, to);
    const expenses = expensesData(branchId, from, to);
    const examForms = examFormsData(branchId);
    const reconciliation = reconciliationData(branchId, from, to);

    const sheets = [
      { name: 'Students', headers: students.headers, rows: students.rows },
      { name: 'Fee Ledger', headers: ledger.headers, rows: ledger.rows },
      { name: 'Receipts', headers: receipts.headers, rows: receipts.rows },
      { name: 'Expenses', headers: expenses.headers, rows: expenses.rows },
      { name: 'Exam Forms', headers: examForms.headers, rows: examForms.rows },
      { name: 'Reconciliation', headers: reconciliation.headers, rows: reconciliation.rows },
    ];

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename="wschools_consolidated_${date}.xls"`);
    res.send(excel.workbook(sheets));
  },

  // ---- CSV downloads -------------------------------------------------------
  studentsCsv(req, res) {
    const { headers, rows } = studentsData(scope(req));
    sendCsv(res, 'students', headers, rows);
  },

  receiptsCsv(req, res) {
    const { headers, rows } = receiptsData(scope(req), clean(req.query.from), clean(req.query.to));
    sendCsv(res, 'receipts', headers, rows);
  },

  expensesCsv(req, res) {
    const { headers, rows } = expensesData(scope(req), clean(req.query.from), clean(req.query.to));
    sendCsv(res, 'expenses', headers, rows);
  },
};

/** Stream a CSV attachment. */
function sendCsv(res, name, headers, rows) {
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="wschools_${name}_${date}.csv"`);
  res.send(csv.build(headers, rows));
}

module.exports = ExportController;
