'use strict';

/**
 * Backup service (M9) — consistent SQLite snapshots with optional
 * AES-256-GCM encryption at rest and retention pruning.
 *
 * A snapshot is a copy of the database file taken after a WAL checkpoint so it
 * is internally consistent. If a passphrase is configured
 * (BACKUP_ENCRYPTION_KEY), the copy is encrypted to `*.sqlite.enc`.
 *
 * File format for encrypted backups:
 *   [16-byte salt][12-byte iv][ciphertext][16-byte GCM auth tag]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db/connection');

const BACKUP_DIR = config.backup.dir;
const NAME_RE = /^backup-[\w.-]+\.sqlite(\.enc)?$/;

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return BACKUP_DIR;
}

function list() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter((name) => NAME_RE.test(name))
    .map((name) => {
      const st = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: st.size, created: st.mtime, encrypted: name.endsWith('.enc') };
    })
    .sort((a, b) => b.created - a.created);
}

/** Validate a name and resolve it to an absolute path inside BACKUP_DIR. */
function resolve(rawName) {
  const name = path.basename(String(rawName || ''));
  if (!NAME_RE.test(name)) return null;
  const full = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(full)) return null;
  return { name, full, encrypted: name.endsWith('.enc') };
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(String(passphrase), salt, 32);
}

function encryptFile(srcPath, destPath, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = fs.readFileSync(srcPath);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.writeFileSync(destPath, Buffer.concat([salt, iv, ciphertext, tag]));
}

function decryptFile(srcPath, destPath, passphrase) {
  const blob = fs.readFileSync(srcPath);
  const salt = blob.subarray(0, 16);
  const iv = blob.subarray(16, 28);
  const tag = blob.subarray(blob.length - 16);
  const ciphertext = blob.subarray(28, blob.length - 16);
  const key = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  fs.writeFileSync(destPath, plaintext);
}

/**
 * Create a backup. Returns { name, full, encrypted, size }.
 * @param {object} opts
 * @param {boolean} [opts.encrypt=auto]  Force on/off; defaults to "on if a key is configured".
 * @param {number}  [opts.retentionDays] Prune backups older than this many days.
 */
function create({ encrypt, retentionDays } = {}) {
  ensureDir();
  // Flush WAL into the main file so the snapshot is consistent.
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch (e) { /* best effort */ }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const plainName = `backup-${stamp}.sqlite`;
  const plainPath = path.join(BACKUP_DIR, plainName);
  fs.copyFileSync(config.db.file, plainPath);

  const key = config.backup.encryptionKey;
  const doEncrypt = encrypt === undefined ? !!key : (encrypt && !!key);

  let result;
  if (doEncrypt) {
    const encName = plainName + '.enc';
    const encPath = plainPath + '.enc';
    encryptFile(plainPath, encPath, key);
    fs.unlinkSync(plainPath); // remove the plaintext copy
    result = { name: encName, full: encPath, encrypted: true };
  } else {
    result = { name: plainName, full: plainPath, encrypted: false };
  }
  result.size = fs.statSync(result.full).size;

  if (retentionDays && retentionDays > 0) prune(retentionDays, result.name);
  return result;
}

/** Delete backups older than `days`, keeping `keepName` regardless. */
function prune(days, keepName) {
  const cutoff = Date.now() - days * 86400000;
  let removed = 0;
  for (const b of list()) {
    if (b.name === keepName) continue;
    if (b.created.getTime() < cutoff) {
      try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); removed += 1; } catch (e) { /* ignore */ }
    }
  }
  return removed;
}

function remove(rawName) {
  const t = resolve(rawName);
  if (!t) return false;
  fs.unlinkSync(t.full);
  return true;
}

module.exports = {
  BACKUP_DIR, NAME_RE, ensureDir, list, resolve, create, prune, remove,
  encryptFile, decryptFile,
};
