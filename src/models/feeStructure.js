'use strict';

const db = require('../db/connection');

/**
 * Fee structures — one row per (course, semester, head) for an academic year.
 * "Dynamic heads" means an admin can add any number of head rows per
 * course/semester.
 */
const FeeStructure = {
  all({ courseId, semester, academicYear, branchId } = {}) {
    const where = [];
    const params = [];
    if (courseId) { where.push('fs.course_id = ?'); params.push(courseId); }
    if (semester) { where.push('fs.semester = ?'); params.push(semester); }
    if (academicYear) { where.push('fs.academic_year = ?'); params.push(academicYear); }
    if (branchId) { where.push('(fs.branch_id = ? OR fs.branch_id IS NULL)'); params.push(branchId); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.all(`
      SELECT fs.*, c.name AS course_name, c.code AS course_code
        FROM fee_structures fs
        LEFT JOIN courses c ON c.id = fs.course_id
        ${clause}
        ORDER BY c.name, fs.semester, fs.fee_head`, params);
  },

  /** Distinct (course, semester, year) groups with totals for the list page. */
  groups() {
    return db.all(`
      SELECT fs.course_id, fs.semester, fs.academic_year,
             c.name AS course_name, c.code AS course_code,
             COUNT(*) AS head_count, SUM(fs.amount) AS total
        FROM fee_structures fs
        LEFT JOIN courses c ON c.id = fs.course_id
        GROUP BY fs.course_id, fs.semester, fs.academic_year
        ORDER BY c.name, fs.semester`);
  },

  forCourseSemester(courseId, semester, academicYear) {
    const params = [courseId, semester];
    let sql = `SELECT * FROM fee_structures WHERE course_id = ? AND semester = ?`;
    if (academicYear) { sql += ' AND academic_year = ?'; params.push(academicYear); }
    return db.all(sql + ' ORDER BY fee_head', params);
  },

  findById(id) {
    return db.get('SELECT * FROM fee_structures WHERE id = ?', [id]);
  },

  create({ course_id, semester, fee_head_id, fee_head, amount, due_date, academic_year, branch_id, late_fee_per_day = 0 }) {
    const r = db.run(
      `INSERT INTO fee_structures (course_id, semester, fee_head_id, fee_head, amount, due_date, academic_year, branch_id, late_fee_per_day)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [course_id, semester, fee_head_id || null, fee_head, amount || 0, due_date || null, academic_year || null, branch_id || null, late_fee_per_day || 0]);
    return Number(r.lastInsertRowid);
  },

  update(id, { fee_head_id, fee_head, amount, due_date, late_fee_per_day }) {
    db.run(`UPDATE fee_structures SET fee_head_id = ?, fee_head = ?, amount = ?, due_date = ?, late_fee_per_day = ? WHERE id = ?`,
      [fee_head_id || null, fee_head, amount || 0, due_date || null, late_fee_per_day || 0, id]);
  },

  remove(id) {
    db.run('DELETE FROM fee_structures WHERE id = ?', [id]);
  },
};

module.exports = FeeStructure;
