'use strict';

const db = require('../db/connection');
const { hashPassword } = require('../utils/helpers');

const User = {
  ROLES: ['super_admin', 'branch_admin', 'accountant', 'receptionist', 'viewer'],

  findById(id) {
    return db.get(
      `SELECT u.*, b.branch_code, b.name AS branch_name
         FROM users u LEFT JOIN branches b ON b.id = u.branch_id
        WHERE u.id = ?`, [id]);
  },

  findByUsername(username) {
    return db.get(
      `SELECT u.*, b.branch_code, b.name AS branch_name
         FROM users u LEFT JOIN branches b ON b.id = u.branch_id
        WHERE lower(u.username) = ?`, [String(username || '').toLowerCase().trim()]);
  },

  findByEmail(email) {
    return db.get('SELECT * FROM users WHERE lower(email) = ?', [String(email || '').toLowerCase().trim()]);
  },

  all({ role, branchId, search, limit = 200, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (role) { where.push('u.role = ?'); params.push(role); }
    if (branchId) { where.push('u.branch_id = ?'); params.push(branchId); }
    if (search) { where.push('(u.name LIKE ? OR u.username LIKE ? OR u.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return db.all(
      `SELECT u.*, b.branch_code, b.name AS branch_name
         FROM users u LEFT JOIN branches b ON b.id = u.branch_id
         ${clause} ORDER BY u.name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  },

  count() {
    return db.get('SELECT COUNT(*) AS c FROM users').c;
  },

  create({ username, name, email, phone, password, role = 'viewer', branchId = null, mustChangePassword = false, status = 'active' }) {
    const result = db.run(
      `INSERT INTO users (username, name, email, phone, password_hash, role, branch_id, must_change_password, status)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [String(username).toLowerCase().trim(), name, email || null, phone || null,
       hashPassword(password), role, branchId, mustChangePassword ? 1 : 0, status]);
    return Number(result.lastInsertRowid);
  },

  update(id, fields) {
    const allowed = ['username', 'name', 'email', 'phone', 'role', 'branch_id', 'status', 'must_change_password'];
    const sets = [];
    const params = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(key === 'username' ? String(fields[key]).toLowerCase().trim() : fields[key]);
      }
    }
    if (!sets.length) return;
    sets.push(`updated_at = datetime('now')`);
    params.push(id);
    db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  },

  setPassword(id, plainPassword) {
    db.run(`UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?`,
      [hashPassword(plainPassword), id]);
  },

  recordLogin(id) {
    db.run(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`, [id]);
  },

  remove(id) {
    db.run('DELETE FROM users WHERE id = ?', [id]);
  },
};

module.exports = User;
