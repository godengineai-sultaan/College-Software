'use strict';

/**
 * System settings (super-admin area). One screen editing the key/value
 * Setting store: institution branding, auto-ID prefixes, fee rules,
 * notification gateways and backup policy. Saved as a single form.
 */

const Setting = require('../models/setting');
const Audit = require('../services/audit');

// Checkbox keys are stored as '1' / '0' (absent form field => '0').
const CHECKBOX_KEYS = ['late_fee_enabled', 'discount_needs_approval', 'sms_enabled', 'email_enabled'];

// Every plain text / number / select key managed from this screen.
const VALUE_KEYS = [
  // Institution / branding
  'institution_name', 'institution_short', 'institution_address', 'institution_phone',
  'institution_email', 'institution_website', 'currency_symbol', 'academic_year',
  // Auto-ID prefixes
  'student_id_prefix', 'receipt_no_prefix', 'voucher_no_prefix', 'examform_no_prefix',
  // Fee rules
  'late_fee_per_day', 'late_fee_max', 'discount_auto_approve_upto',
  // Notifications
  'sms_provider', 'sms_api_key', 'sms_sender_id',
  'email_provider', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
  'reminder_days_before',
  // Backup
  'backup_retention_days',
];

// Secrets: never re-displayed; a blank submission means "keep existing value".
const SECRET_KEYS = ['sms_api_key', 'smtp_pass'];

const SettingsController = {
  index(req, res) {
    res.render('settings/index', {
      title: 'Settings',
      config: Setting.all(),
    });
  },

  save(req, res) {
    // Checkboxes → '1' when present, '0' when unchecked.
    for (const key of CHECKBOX_KEYS) {
      Setting.set(key, req.body[key] ? '1' : '0');
    }
    // Plain values: only persist keys that were actually posted.
    for (const key of VALUE_KEYS) {
      if (req.body[key] === undefined) continue;
      // Don't overwrite a stored secret with a blank (masked) field.
      if (SECRET_KEYS.includes(key) && String(req.body[key]).trim() === '') continue;
      Setting.set(key, req.body[key]);
    }
    Audit.log(req, 'UPDATE', 'settings', null, null, { updated: true, by: req.user && req.user.username });
    req.flash('success', 'Settings saved.');
    res.redirect('/settings');
  },
};

module.exports = SettingsController;
