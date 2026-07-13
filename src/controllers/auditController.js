'use strict';

/**
 * Audit Logs (M9) — read-only browser over the audit_logs trail written by the
 * Audit service. Records who did what, when and from where, with before/after
 * values. No mutations happen here.
 */

const Audit = require('../services/audit');
const { paginate, pageCount, clean } = require('../utils/helpers');

// Common actions surfaced in the filter dropdown.
const ACTIONS = ['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'CANCEL', 'BULK_INSERT'];

const AuditController = {
  list(req, res) {
    const { page, perPage, offset } = paginate(req.query, 20);
    const filter = {
      table: clean(req.query.table) || undefined,
      action: clean(req.query.action) || undefined,
      userId: parseInt(req.query.user, 10) || undefined,
      limit: perPage, offset,
    };
    const rows = Audit.list(filter);
    const total = Audit.count(filter);

    res.render('audit/list', {
      title: 'Audit Logs',
      logs: rows,
      total,
      page, pages: pageCount(total, perPage),
      baseQuery: req.query,
      actions: ACTIONS,
    });
  },
};

module.exports = AuditController;
