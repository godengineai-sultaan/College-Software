'use strict';

/**
 * Backup & Restore (M9) — super_admin utility to snapshot the SQLite database.
 * Backups live in a `backups/` directory under the app root and are optionally
 * encrypted at rest (AES-256-GCM) when BACKUP_ENCRYPTION_KEY is set. A cron job
 * can call `npm run backup:create` (or POST /backup/create) for daily backups;
 * old snapshots are pruned per the backup_retention_days setting.
 */

const fs = require('fs');
const config = require('../config');
const Setting = require('../models/setting');
const Audit = require('../services/audit');
const Backup = require('../services/backup');

const BackupController = {
  index(req, res) {
    Backup.ensureDir();
    let dbSize = 0;
    try { dbSize = fs.statSync(config.db.file).size; } catch (e) { dbSize = 0; }

    res.render('backup/index', {
      title: 'Backup & Restore',
      dbFile: config.db.file,
      dbSize,
      retentionDays: Setting.num('backup_retention_days'),
      backups: Backup.list(),
      encryptionEnabled: !!config.backup.encryptionKey,
    });
  },

  create(req, res) {
    try {
      const result = Backup.create({ retentionDays: Setting.num('backup_retention_days') });
      Audit.log(req, 'BACKUP', 'database', null, null, { file: result.name, encrypted: result.encrypted });
      req.flash('success', `Backup created: ${result.name}${result.encrypted ? ' (encrypted)' : ''}`);
    } catch (err) {
      req.flash('error', `Backup failed: ${err.message}`);
    }
    res.redirect('/backup');
  },

  download(req, res) {
    const target = Backup.resolve(req.params.name);
    if (!target) { req.flash('error', 'Backup not found.'); return res.redirect('/backup'); }
    res.download(target.full, target.name);
  },

  remove(req, res) {
    const target = Backup.resolve(req.body.name);
    if (!target) { req.flash('error', 'Backup not found.'); return res.redirect('/backup'); }
    try {
      Backup.remove(target.name);
      Audit.log(req, 'DELETE', 'database', null, { file: target.name }, null);
      req.flash('success', `Backup deleted: ${target.name}`);
    } catch (err) {
      req.flash('error', `Could not delete backup: ${err.message}`);
    }
    res.redirect('/backup');
  },
};

module.exports = BackupController;
