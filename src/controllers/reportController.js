'use strict';

/**
 * M7 — Reports & Analytics.
 *
 * A read-only analytics hub built almost entirely on the Stats service.
 * All figures honour branch scoping: branch-scoped roles are locked to their
 * own branch (req.branchScopeId), while all-branch roles (super_admin/viewer)
 * may pass ?branch=ID plus an optional ?from=&to= date window.
 */

const Stats = require('../services/stats');
const Branch = require('../models/branch');
const Receipt = require('../models/receipt');
const { clean } = require('../utils/helpers');

/** Resolve the branch a report should be scoped to (own branch, or optional filter). */
function scope(req) {
  if (req.branchScopeId) return req.branchScopeId;              // forced to own branch
  const b = parseInt(req.query.branch, 10);
  return Number.isFinite(b) && b > 0 ? b : null;               // all-branch: optional filter
}

/** Branches this user may pick from (scoped roles get only theirs). */
function pickableBranches(req) {
  if (req.branchScopeId) {
    const b = Branch.findById(req.branchScopeId);
    return b ? [b] : [];
  }
  return Branch.all({ activeOnly: true });
}

const ReportController = {
  // ---- Analytics hub -------------------------------------------------------
  index(req, res) {
    const branchId = scope(req);
    const from = clean(req.query.from);
    const to = clean(req.query.to);
    const range = { branchId, from, to };

    const totalCollection = Stats.collections(range).total;
    const totalExpense = Stats.expenses(range).total;

    const d = {
      totalCollection,
      totalExpense,
      netCollection: totalCollection - totalExpense,
      outstanding: Stats.outstanding({ branchId }),
      monthly: Stats.monthlyCollection({ branchId }).slice(-12),
      modeDist: Stats.paymentModeDistribution(range),
      byCourse: Stats.collectionByCourse({ branchId }),
      feeStatus: Stats.feeStatusBreakdown({ branchId }),
      branchCompare: branchId ? null : Stats.branchComparison(),
    };

    res.render('reports/index', {
      title: 'Reports & Analytics',
      d, branchId, from, to,
      branches: pickableBranches(req),
    });
  },

  // ---- Full defaulters list ------------------------------------------------
  defaulters(req, res) {
    const branchId = scope(req);
    const rows = Stats.defaulters({ branchId, limit: 500 });
    const totalDue = rows.reduce((sum, r) => sum + Number(r.due || 0), 0);

    res.render('reports/defaulters', {
      title: 'Defaulters Report',
      rows, totalDue, branchId,
      branches: pickableBranches(req),
    });
  },

  // ---- Collection report for a date range ----------------------------------
  collection(req, res) {
    const branchId = scope(req);
    const month = Stats.monthRange();
    const from = clean(req.query.from) || month.from;
    const to = clean(req.query.to) || month.to;
    const range = { branchId, from, to };

    const summary = Stats.collections(range);            // { total, count }
    const modeDist = Stats.paymentModeDistribution(range);
    // Active receipts only so the table reconciles with the collection total.
    const receipts = Receipt.all({ branchId, from, to, status: 'active', limit: 500 });

    res.render('reports/collection', {
      title: 'Collection Report',
      total: summary.total,
      count: summary.count,
      modeDist, receipts, from, to, branchId,
      branches: pickableBranches(req),
    });
  },
};

module.exports = ReportController;
