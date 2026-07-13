'use strict';

/**
 * Notifications (M10) — browse the SMS / Email / dashboard message log, compose
 * a manual message, and blast fee-due reminders to defaulters.
 *
 * Delivery itself lives in the Notify service; this controller only orchestrates
 * the UI, filtering and branch scoping.
 */

const Notify = require('../services/notify');
const Setting = require('../models/setting');
const Stats = require('../services/stats');
const { paginate, pageCount, clean } = require('../utils/helpers');

const CHANNELS = ['sms', 'email', 'dashboard'];
const STATUSES = ['queued', 'sent', 'failed', 'read'];

const NotificationController = {
  list(req, res) {
    const { page, perPage, offset } = paginate(req.query, 20);
    const channel = clean(req.query.channel) || undefined;
    const status = clean(req.query.status) || undefined;

    const rows = Notify.list({ channel, status, limit: perPage, offset });
    const total = Notify.count({ channel, status });

    // KPI tiles — respect the current channel filter, break down by status.
    const kpi = {
      sent: Notify.count({ channel, status: 'sent' }),
      queued: Notify.count({ channel, status: 'queued' }),
      failed: Notify.count({ channel, status: 'failed' }),
    };

    res.render('notifications/list', {
      title: 'Notifications',
      notifications: rows,
      total, kpi,
      page, pages: pageCount(total, perPage),
      baseQuery: req.query,
      channels: CHANNELS,
      statuses: STATUSES,
      smsEnabled: Setting.bool('sms_enabled'),
      emailEnabled: Setting.bool('email_enabled'),
    });
  },

  composeForm(req, res) {
    res.render('notifications/compose', {
      title: 'Compose Notification',
      channels: CHANNELS,
      smsEnabled: Setting.bool('sms_enabled'),
      emailEnabled: Setting.bool('email_enabled'),
    });
  },

  send(req, res) {
    const channel = clean(req.body.channel) || 'dashboard';
    const recipient = clean(req.body.recipient);
    const message = clean(req.body.message);
    if (!message) {
      req.flash('error', 'Please enter a message to send.');
      return res.redirect('/notifications/compose');
    }
    if (channel !== 'dashboard' && !recipient) {
      req.flash('error', 'Please enter a recipient (phone or email).');
      return res.redirect('/notifications/compose');
    }

    Notify.send({
      channel,
      recipient,
      recipientName: clean(req.body.recipient_name),
      subject: clean(req.body.subject),
      message,
      branchId: req.branchScopeId,
    });

    req.flash('success', 'Notification queued/sent.');
    res.redirect('/notifications');
  },

  // Blast a fee-due reminder SMS to every student with an outstanding balance.
  remind(req, res) {
    const currency = Setting.get('currency_symbol') || '₹';
    const shortName = Setting.get('institution_short');
    const defaulters = Stats.defaulters({ branchId: req.branchScopeId, limit: 200 });

    let count = 0;
    defaulters.forEach((s) => {
      const due = Number(s.due).toLocaleString('en-IN');
      Notify.send({
        channel: 'sms',
        recipient: Notify.normalizePhone(s.phone),
        recipientName: s.name,
        subject: 'Fee Due Reminder',
        message: `Dear ${s.name}, your fee of ${currency}${due} is pending. Please pay soon. - ${shortName}`,
        relatedType: 'student',
        relatedId: s.id,
        branchId: s.branch_id,
      });
      count += 1;
    });

    req.flash(count ? 'success' : 'info',
      count ? `${count} fee reminder(s) queued.` : 'No students with pending dues to remind.');
    res.redirect('/notifications');
  },
};

module.exports = NotificationController;
