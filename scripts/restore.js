'use strict';

/**
 * CLI restore — replace the live database with a backup snapshot.
 *
 *   npm run restore -- backup-2026-07-13T02-00-00-000Z.sqlite
 *   npm run restore -- backups/backup-....sqlite.enc     (needs BACKUP_ENCRYPTION_KEY)
 *
 * Stop the server before restoring. A safety snapshot of the current database
 * is taken first, so a bad restore can be undone.
 */

const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const Backup = require('../src/services/backup');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run restore -- <backup-file-name-or-path>');
  console.error('Available backups:');
  for (const b of Backup.list()) console.error('  ', b.name, b.encrypted ? '(encrypted)' : '');
  process.exit(1);
}

// Resolve the source: a bare name inside backups/, or an explicit path.
let src = path.isAbsolute(arg) ? arg : path.join(Backup.BACKUP_DIR, path.basename(arg));
if (!fs.existsSync(src) && fs.existsSync(arg)) src = arg;
if (!fs.existsSync(src)) {
  console.error('✗ Backup not found:', arg);
  process.exit(1);
}

const encrypted = src.endsWith('.enc');
if (encrypted && !config.backup.encryptionKey) {
  console.error('✗ This backup is encrypted but BACKUP_ENCRYPTION_KEY is not set.');
  process.exit(1);
}

try {
  // 1) Safety snapshot of the current DB (if any).
  if (fs.existsSync(config.db.file)) {
    const safety = path.join(Backup.BACKUP_DIR, `backup-prerestore-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    Backup.ensureDir();
    fs.copyFileSync(config.db.file, safety);
    console.log('• Safety snapshot of current DB:', path.basename(safety));
  }

  // 2) Remove stale WAL/SHM sidecars so the restored file is authoritative.
  for (const suffix of ['-wal', '-shm']) {
    const f = config.db.file + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  // 3) Restore (decrypt if needed).
  if (encrypted) {
    Backup.decryptFile(src, config.db.file, config.backup.encryptionKey);
  } else {
    fs.copyFileSync(src, config.db.file);
  }
  console.log('✓ Database restored from', path.basename(src));
  console.log('  Restart the server to use the restored data.');
  process.exit(0);
} catch (err) {
  console.error('✗ Restore failed:', err.message);
  process.exit(1);
}
