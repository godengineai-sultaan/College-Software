'use strict';

const db = require('../db/connection');

const Branch = {
  all({ activeOnly = false } = {}) {
    const clause = activeOnly ? 'WHERE is_active = 1' : '';
    return db.all(`SELECT * FROM branches ${clause} ORDER BY branch_code`);
  },

  findById(id) {
    return db.get('SELECT * FROM branches WHERE id = ?', [id]);
  },

  findByCode(code) {
    return db.get('SELECT * FROM branches WHERE branch_code = ?', [String(code || '').toUpperCase()]);
  },

  create({ branch_code, name, address, phone, email, is_active = 1 }) {
    const r = db.run(
      `INSERT INTO branches (branch_code, name, address, phone, email, is_active) VALUES (?,?,?,?,?,?)`,
      [String(branch_code).toUpperCase().trim(), name, address || null, phone || null, email || null, is_active ? 1 : 0]);
    return Number(r.lastInsertRowid);
  },

  update(id, { branch_code, name, address, phone, email, is_active }) {
    db.run(
      `UPDATE branches SET branch_code = ?, name = ?, address = ?, phone = ?, email = ?, is_active = ? WHERE id = ?`,
      [String(branch_code).toUpperCase().trim(), name, address || null, phone || null, email || null, is_active ? 1 : 0, id]);
  },

  remove(id) {
    db.run('DELETE FROM branches WHERE id = ?', [id]);
  },
};

module.exports = Branch;
