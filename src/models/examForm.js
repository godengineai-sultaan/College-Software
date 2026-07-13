'use strict';

const db = require('../db/connection');
const IdGen = require('../services/idgen');
const Branch = require('./branch');

/** M5: Exam forms — Regular / Backlog / Improvement with progress tracking. */
const ExamForm = {
  _filter({ branchId, examType, status, search } = {}) {
    const where = [];
    const params = [];
    if (branchId) { where.push('ef.branch_id = ?'); params.push(branchId); }
    if (examType) { where.push('ef.exam_type = ?'); params.push(examType); }
    if (status) { where.push('ef.status = ?'); params.push(status); }
    if (search) { where.push('(ef.form_no LIKE ? OR s.name LIKE ? OR s.unique_id LIKE ?)'); const q = `%${search}%`; params.push(q, q, q); }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  },

  all(opts = {}) {
    const { clause, params } = this._filter(opts);
    const limit = opts.limit || 20;
    const offset = opts.offset || 0;
    return db.all(`
      SELECT ef.*, s.name AS student_name, s.unique_id AS student_uid, s.course_name,
             b.branch_code
        FROM exam_forms ef
        LEFT JOIN students s ON s.id = ef.student_id
        LEFT JOIN branches b ON b.id = ef.branch_id
        ${clause} ORDER BY ef.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  },

  count(opts = {}) {
    const { clause, params } = this._filter(opts);
    return db.get(`
      SELECT COUNT(*) AS c FROM exam_forms ef
      LEFT JOIN students s ON s.id = ef.student_id ${clause}`, params).c;
  },

  findById(id) {
    return db.get(`
      SELECT ef.*, s.name AS student_name, s.unique_id AS student_uid, s.course_name, s.phone AS student_phone,
             b.branch_code
        FROM exam_forms ef
        LEFT JOIN students s ON s.id = ef.student_id
        LEFT JOIN branches b ON b.id = ef.branch_id WHERE ef.id = ?`, [id]);
  },

  create(data, createdBy = null) {
    const branch = Branch.findById(data.branch_id);
    const code = branch ? branch.branch_code : 'A';
    const formNo = data.form_no || IdGen.examForm(code);
    const r = db.run(
      `INSERT INTO exam_forms (form_no, student_id, exam_type, session, semester, subjects, fee_amount, paid, status, progress, submission_date, branch_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [formNo, data.student_id, data.exam_type || 'regular', data.session || null, data.semester || null,
       data.subjects || null, data.fee_amount || 0, data.paid ? 1 : 0, data.status || 'submitted',
       data.progress || 25, data.submission_date || new Date().toISOString().slice(0, 10), data.branch_id, createdBy]);
    return { id: Number(r.lastInsertRowid), form_no: formNo };
  },

  update(id, data) {
    const fields = ['exam_type', 'session', 'semester', 'subjects', 'fee_amount', 'paid', 'status', 'progress'];
    const sets = [];
    const params = [];
    for (const f of fields) if (data[f] !== undefined) { sets.push(`${f} = ?`); params.push(data[f]); }
    if (!sets.length) return;
    params.push(id);
    db.run(`UPDATE exam_forms SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  /** Progress % by status, to drive the progress bars. */
  progressFor(status) {
    return { draft: 10, submitted: 40, approved: 70, paid: 100, rejected: 0 }[status] || 0;
  },

  remove(id) {
    db.run('DELETE FROM exam_forms WHERE id = ?', [id]);
  },
};

module.exports = ExamForm;
