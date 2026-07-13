'use strict';

/**
 * Backup & Restore (M9) — super_admin utility to snapshot the SQLite database
 * file. Backups are plain copies of the DB file kept in a `backups/` directory
 * under the app root. A cron job can call POST /backup/create for daily backups;
 * old snapshots are pruned per the backup_retention_days setting.
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db/connection');
const Setting = require('../models/setting');
const Audit = require('../services/audit');

const BACKUP_DIR = path.join(config.root, 'backups');
// Only files matching this pattern are treated as backups (guards downloads/deletes).
const NAME_RE = /^backup-[\w.-]+\.sqlite$/;

/** Ensure the backups directory exists and return its path. */
function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}

/** List existing backups, newest first. */
function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter((name) => NAME_RE.test(name))
    .map((name) => {
      const st = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: st.size, created: st.mtime };
    })
    .sort((a, b) => b.created - a.created);
}

/** Resolve + validate a backup file name to an absolute path inside BACKUP_DIR. */
function resolveBackup(rawName) {
  const name = path.basename(String(rawName || ''));   // strip any path traversal
  if (!NAME_RE.test(name)) return null;
  const full = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(full)) return null;
  return { name, full };
}

const BackupController = {
  index(req, res) {
    ensureDir();
    let dbSize = 0;
    try { dbSize = fs.statSync(config.db.file).size; } catch (e) { dbSize = 0; }

    res.render('backup/index', {
      title: 'Backup & Restore',
      dbFile: config.db.file,
      dbSize,
      retentionDays: Setting.num('backup_retention_days'),
      backups: listBackups(),
    });
  },

  create(req, res) {
    try {
      ensureDir();
      // Flush the WAL into the main DB file so the copy is fully consistent.
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = `backup-${timestamp}.sqlite`;
      const full = path.join(BACKUP_DIR, name);
      fs.copyFileSync(config.db.file, full);

      // Retention — delete backups older than backup_retention_days.
      const days = Setting.num('backup_retention_days');
      if (days > 0) {
        const cutoff = Date.now() - days * 86400000;
        listBackups().forEach((b) => {
          if (b.name !== name && b.created.getTime() < cutoff) {
            try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch (e) { /* ignore */ }
          }
        });
      }

      Audit.log(req, 'BACKUP', 'database', null, null, { file: name });
      req.flash('success', `Backup created: ${name}`);
    } catch (err) {
      req.flash('error', `Backup failed: ${err.message}`);
    }
    res.redirect('/backup');
  },

  download(req, res) {
    const target = resolveBackup(req.params.name);
    if (!target) { req.flash('error', 'Backup not found.'); return res.redirect('/backup'); }
    res.download(target.full, target.name);
  },

  remove(req, res) {
    const target = resolveBackup(req.body.name);
    if (!target) { req.flash('error', 'Backup not found.'); return res.redirect('/backup'); }
    try {
      fs.unlinkSync(target.full);
      Audit.log(req, 'DELETE', 'database', null, { file: target.name }, null);
      req.flash('success', `Backup deleted: ${target.name}`);
    } catch (err) {
      req.flash('error', `Could not delete backup: ${err.message}`);
    }
    res.redirect('/backup');
  },
};

module.exports = BackupController;
