'use strict';

const db = require('../db/connection');
const IdGen = require('../services/idgen');
const Branch = require('./branch');
const Course = require('./course');

/**
 * M2: Student lifecycle. Auto unique_id, soft-delete, branch scoping and
 * bulk insert (for the Excel/CSV upload flow).
 */
const Student = {
  /** Build the WHERE clause shared by list/count, honouring branch scope. */
  _filter({ branchId, courseId, semester, status, search, includeDeleted = false } = {}) {
    const where = [];
    const params = [];
    if (!includeDeleted) where.push('s.deleted_at IS NULL');
    else where.push('s.deleted_at IS NOT NULL');
    if (branchId) { where.push('s.branch_id = ?'); params.push(branchId); }
    if (courseId) { where.push('s.course_id = ?'); params.push(courseId); }
    if (semester) { where.push('s.semester = ?'); params.push(semester); }
    if (status) { where.push('s.status = ?'); params.push(status); }
    if (search) {
      where.push('(s.name LIKE ? OR s.unique_id LIKE ? OR s.roll_no LIKE ? OR s.phone LIKE ? OR s.guardian_phone LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q, q, q);
    }
    return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
  },

  all(opts = {}) {
    const { clause, params } = this._filter(opts);
    const limit = opts.limit || 20;
    const offset = opts.offset || 0;
    return db.all(`
      SELECT s.*, c.name AS course_disp, b.branch_code, b.name AS branch_name
        FROM students s
        LEFT JOIN courses c ON c.id = s.course_id
        LEFT JOIN branches b ON b.id = s.branch_id
        ${clause}
        ORDER BY s.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  },

  count(opts = {}) {
    const { clause, params } = this._filter(opts);
    return db.get(`SELECT COUNT(*) AS c FROM students s ${clause}`, params).c;
  },

  findById(id) {
    return db.get(`
      SELECT s.*, c.name AS course_disp, c.code AS course_code, c.total_semesters,
             b.branch_code, b.name AS branch_name
        FROM students s
        LEFT JOIN courses c ON c.id = s.course_id
        LEFT JOIN branches b ON b.id = s.branch_id
        WHERE s.id = ?`, [id]);
  },

  findByUniqueId(uid) {
    return db.get('SELECT * FROM students WHERE unique_id = ?', [uid]);
  },

  /** Live search for the fee-collection screen (name / id / phone). */
  search(term, { branchId, limit = 15 } = {}) {
    const params = [];
    let sql = `
      SELECT s.*, c.name AS course_disp, b.branch_code, b.name AS branch_name
        FROM students s
        LEFT JOIN courses c ON c.id = s.course_id
        LEFT JOIN branches b ON b.id = s.branch_id
       WHERE s.deleted_at IS NULL AND (s.name LIKE ? OR s.unique_id LIKE ? OR s.roll_no LIKE ? OR s.phone LIKE ?)`;
    const q = `%${term}%`;
    params.push(q, q, q, q);
    if (branchId) { sql += ' AND s.branch_id = ?'; params.push(branchId); }
    sql += ' ORDER BY s.name LIMIT ?';
    params.push(limit);
    return db.all(sql, params);
  },

  /**
   * Create a student, generating the branch-scoped unique_id automatically.
   * Returns { id, unique_id }.
   */
  create(data, createdBy = null) {
    const branch = Branch.findById(data.branch_id);
    const branchCode = branch ? branch.branch_code : 'A';
    const uid = data.unique_id || IdGen.student(branchCode);
    let courseName = data.course_name;
    if (!courseName && data.course_id) {
      const c = Course.findById(data.course_id);
      courseName = c ? c.name : null;
    }
    const r = db.run(
      `INSERT INTO students
        (unique_id, name, roll_no, course_id, course_name, semester, branch_id, academic_year,
         admission_date, gender, dob, category, phone, email, address, city, state,
         guardian_name, guardian_phone, guardian_relation, photo, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uid, data.name, data.roll_no || null, data.course_id || null, courseName || null,
       data.semester || 1, data.branch_id, data.academic_year || null, data.admission_date || null,
       data.gender || null, data.dob || null, data.category || null, data.phone || null, data.email || null,
       data.address || null, data.city || null, data.state || null,
       data.guardian_name || null, data.guardian_phone || null, data.guardian_relation || null,
       data.photo || null, data.status || 'active', createdBy]);
    return { id: Number(r.lastInsertRowid), unique_id: uid };
  },

  update(id, data) {
    const fields = ['name', 'roll_no', 'course_id', 'course_name', 'semester', 'academic_year',
      'admission_date', 'gender', 'dob', 'category', 'phone', 'email', 'address', 'city', 'state',
      'guardian_name', 'guardian_phone', 'guardian_relation', 'photo', 'status'];
    const sets = [];
    const params = [];
    for (const f of fields) {
      if (data[f] !== undefined) { sets.push(`${f} = ?`); params.push(data[f]); }
    }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`);
    params.push(id);
    db.run(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  /** Soft delete — keeps the record but hides it. */
  softDelete(id) {
    db.run(`UPDATE students SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [id]);
  },

  restore(id) {
    db.run(`UPDATE students SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?`, [id]);
  },

  /** Permanent delete (used rarely; cascades to fees/receipts). */
  hardDelete(id) {
    db.run('DELETE FROM students WHERE id = ?', [id]);
  },

  /** Quick per-branch / per-status counts for the dashboard. */
  stats(branchId) {
    const p = [];
    let bclause = 'deleted_at IS NULL';
    if (branchId) { bclause += ' AND branch_id = ?'; p.push(branchId); }
    return db.get(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active,
             SUM(CASE WHEN status='passed_out' THEN 1 ELSE 0 END) AS passed_out
        FROM students WHERE ${bclause}`, p);
  },
};

module.exports = Student;
