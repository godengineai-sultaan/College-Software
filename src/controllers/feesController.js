'use strict';

const Branch = require('../models/branch');
const Stats = require('../services/stats');
const { clean } = require('../utils/helpers');

/**
 * Student Fees & Dues (M-fees) — a "defaulters" oriented view of students who
 * still owe money, with headline KPIs. Read-only; collection happens in the
 * Collection module.
 */

// Cap the number of defaulters we pull in one go. Big enough that the KPI count
// and search cover the whole population for realistic branch sizes, without
// paging (this is a focused dues list, not the full student directory).
const CAP = 2000;
// How many rows to show before the user asks to "show all".
const DEFAULT_SHOWN = 50;

/** Resolve the branch a query should be scoped to (mirrors studentController). */
function scope(req) {
  if (req.branchScopeId) return req.branchScopeId;             // forced to own branch
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

const FeesController = {
  list(req, res) {
    const branchId = scope(req);
    const q = clean(req.query.q);
    const showAll = req.query.all === '1';

    // Pull the defaulters once (capped) so the KPI count and search are accurate.
    const defaulters = Stats.defaulters({ branchId, limit: CAP });
    const defaultersCount = defaulters.length;

    // Optional client-side search over the pulled rows (Stats.defaulters has no
    // search of its own; the CAP keeps this covering the full population).
    let rows = defaulters;
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter((r) =>
        (r.name && r.name.toLowerCase().includes(needle)) ||
        (r.unique_id && r.unique_id.toLowerCase().includes(needle)) ||
        (r.phone && String(r.phone).toLowerCase().includes(needle)) ||
        (r.course_name && r.course_name.toLowerCase().includes(needle)));
    }
    const matched = rows.length;
    if (!showAll) rows = rows.slice(0, DEFAULT_SHOWN);

    res.render('fees/list', {
      title: 'Fees & Dues',
      rows,
      matched,                 // rows matching the current search (before the show-limit)
      defaultersCount,         // total students with dues (in scope)
      outstanding: Stats.outstanding({ branchId }),
      studentCount: Stats.studentCount({ branchId }),
      branches: pickableBranches(req),
      shownLimit: DEFAULT_SHOWN,
      showAll,
      capped: defaultersCount >= CAP,
      baseQuery: req.query,
    });
  },
};

module.exports = FeesController;
