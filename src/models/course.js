'use strict';

const db = require('../db/connection');

const Course = {
  all({ activeOnly = false } = {}) {
    const clause = activeOnly ? 'WHERE is_active = 1' : '';
    return db.all(`SELECT * FROM courses ${clause} ORDER BY name`);
  },

  findById(id) {
    return db.get('SELECT * FROM courses WHERE id = ?', [id]);
  },

  findByCode(code) {
    return db.get('SELECT * FROM courses WHERE code = ?', [code]);
  },

  /** Courses with a live student count (for the course-grid navigation). */
  withCounts() {
    return db.all(`
      SELECT c.*,
             (SELECT COUNT(*) FROM students s WHERE s.course_id = c.id AND s.deleted_at IS NULL) AS student_count
        FROM courses c ORDER BY c.name`);
  },

  create({ name, code, duration_years, total_semesters, description, is_active = 1 }) {
    const r = db.run(
      `INSERT INTO courses (name, code, duration_years, total_semesters, description, is_active) VALUES (?,?,?,?,?,?)`,
      [name, String(code).toUpperCase().trim(), duration_years || 3, total_semesters || 6, description || null, is_active ? 1 : 0]);
    return Number(r.lastInsertRowid);
  },

  update(id, { name, code, duration_years, total_semesters, description, is_active }) {
    db.run(
      `UPDATE courses SET name = ?, code = ?, duration_years = ?, total_semesters = ?, description = ?, is_active = ? WHERE id = ?`,
      [name, String(code).toUpperCase().trim(), duration_years || 3, total_semesters || 6, description || null, is_active ? 1 : 0, id]);
  },

  remove(id) {
    db.run('DELETE FROM courses WHERE id = ?', [id]);
  },
};

module.exports = Course;
