'use strict';

const db = require('../db/connection');

const FeeHead = {
  all({ activeOnly = false } = {}) {
    const clause = activeOnly ? 'WHERE is_active = 1' : '';
    return db.all(`SELECT * FROM fee_heads ${clause} ORDER BY sort_order, name`);
  },

  findById(id) {
    return db.get('SELECT * FROM fee_heads WHERE id = ?', [id]);
  },

  create({ name, code, sort_order = 0, is_active = 1 }) {
    const r = db.run(
      `INSERT INTO fee_heads (name, code, sort_order, is_active) VALUES (?,?,?,?)`,
      [name, code || null, sort_order, is_active ? 1 : 0]);
    return Number(r.lastInsertRowid);
  },

  update(id, { name, code, sort_order, is_active }) {
    db.run(`UPDATE fee_heads SET name = ?, code = ?, sort_order = ?, is_active = ? WHERE id = ?`,
      [name, code || null, sort_order || 0, is_active ? 1 : 0, id]);
  },

  remove(id) {
    db.run('DELETE FROM fee_heads WHERE id = ?', [id]);
  },
};

module.exports = FeeHead;
