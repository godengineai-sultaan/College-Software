'use strict';

/**
 * Settings model — an editable key/value store powering institution
 * configuration. The client changes branding, rules and gateway keys here
 * without touching code.
 */

const db = require('../db/connection');

const DEFAULTS = {
  // Branding / institution
  institution_name: 'WSchools College',
  institution_short: 'WSchools',
  institution_address: 'Main Campus, City',
  institution_phone: '+91 00000 00000',
  institution_email: 'info@wschools.edu',
  institution_website: 'www.wschools.edu',
  currency_symbol: '₹',
  academic_year: '2025-2026',

  // Auto-ID prefixes (format: PREFIX-<branch>-<yy>-<seq>)
  student_id_prefix: 'COL',
  receipt_no_prefix: 'REC',
  voucher_no_prefix: 'VCH',
  examform_no_prefix: 'EXF',

  // Fee rules
  late_fee_enabled: '1',
  late_fee_per_day: '10',            // ₹ per day past due date
  late_fee_max: '2000',
  discount_needs_approval: '1',      // discounts above threshold need approval
  discount_auto_approve_upto: '500',

  // Notifications
  sms_enabled: '0',                  // turn on when a gateway is configured
  sms_provider: 'fast2sms',          // fast2sms | msg91
  sms_api_key: '',
  sms_sender_id: 'WSCHL',
  email_enabled: '0',
  email_provider: 'smtp',            // smtp | sendgrid
  smtp_host: '',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  reminder_days_before: '3',         // deadline reminder window

  // Backup
  backup_retention_days: '30',
};

const Setting = {
  get(key) {
    const row = db.get('SELECT value FROM settings WHERE key = ?', [key]);
    if (row) return row.value;
    return DEFAULTS[key] !== undefined ? DEFAULTS[key] : null;
  },

  bool(key) {
    const v = this.get(key);
    return v === '1' || v === 1 || v === true || v === 'true';
  },

  num(key, fallback = 0) {
    const n = Number(this.get(key));
    return Number.isFinite(n) ? n : fallback;
  },

  all() {
    const rows = db.all('SELECT key, value FROM settings');
    const merged = { ...DEFAULTS };
    for (const r of rows) merged[r.key] = r.value;
    return merged;
  },

  set(key, value) {
    db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, value === undefined || value === null ? null : String(value)]
    );
  },

  setMany(obj) {
    for (const [k, v] of Object.entries(obj || {})) this.set(k, v);
  },

  defaults: DEFAULTS,
};

module.exports = Setting;
