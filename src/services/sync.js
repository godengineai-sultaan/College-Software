'use strict';

/**
 * Sync Engine (M1) — records the two-phase commit / mirroring of a
 * cross-branch transaction so it can be reconciled and audited.
 *
 * In this single-database deployment the student ledger is shared, so a
 * cross-branch payment is already consistent; the sync_log makes the
 * "prepare → commit → mirror" lifecycle explicit and gives the reconciliation
 * report something to verify (no double counting).
 */

const crypto = require('crypto');
const db = require('../db/connection');

const Sync = {
  newRef() {
    return 'SYNC-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  },

  /** Phase 1 — prepare. Returns the sync row id and txn ref. */
  prepare({ entity, recordId, sourceBranch, targetBranch, payload }) {
    const txnRef = this.newRef();
    const r = db.run(
      `INSERT INTO sync_log (txn_ref, entity, record_id, source_branch, target_branch, phase, status, payload)
       VALUES (?,?,?,?,?, 'prepare', 'pending', ?)`,
      [txnRef, entity, recordId, sourceBranch, targetBranch, payload ? JSON.stringify(payload) : null]);
    return { id: Number(r.lastInsertRowid), txnRef };
  },

  /** Phase 2 — commit. */
  commit(id) {
    db.run(`UPDATE sync_log SET phase = 'commit', status = 'committed', committed_at = datetime('now') WHERE id = ?`, [id]);
  },

  rollback(id, error) {
    db.run(`UPDATE sync_log SET phase = 'rolled_back', status = 'failed', error = ? WHERE id = ?`, [error || null, id]);
  },

  recent(limit = 50) {
    return db.all('SELECT * FROM sync_log ORDER BY id DESC LIMIT ?', [limit]);
  },

  stats() {
    return db.get(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN status='committed' THEN 1 ELSE 0 END) AS committed,
             SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
             SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending
        FROM sync_log`);
  },
};

module.exports = Sync;
