'use strict';

const Discount = require('../models/discount');
const Student = require('../models/student');
const StudentFee = require('../models/studentFee');
const FeeHead = require('../models/feeHead');
const Setting = require('../models/setting');
const Branch = require('../models/branch');
const Audit = require('../services/audit');
const { paginate, pageCount, clean } = require('../utils/helpers');

/**
 * M3: Discount request / approval workflow. Lives under the 'structures' area.
 * Small discounts can auto-approve (per settings); larger ones queue as
 * 'pending' for a manager. Approving a discount also applies it to the matching
 * fee ledger line so the student's balance drops immediately.
 */

const STATUSES = ['pending', 'approved', 'rejected'];

/** Resolve the branch a query should be scoped to (mirrors studentController). */
function scope(req) {
  if (req.branchScopeId) return req.branchScopeId;
  const b = parseInt(req.query.branch, 10);
  return Number.isFinite(b) && b > 0 ? b : null;
}

/** Branches this user may pick from (scoped roles get only theirs). */
function pickableBranches(req) {
  if (req.branchScopeId) {
    const b = Branch.findById(req.branchScopeId);
    return b ? [b] : [];
  }
  return Branch.all({ activeOnly: true });
}

/**
 * Apply an approved discount to the student's ledger: find the ledger line for
 * this fee head and add the discount on top of any existing one. Returns true
 * if a matching line was found and updated.
 */
function applyToLedger(studentId, feeHead, amount) {
  if (!feeHead || !amount) return false;
  const line = StudentFee.forStudent(studentId).find((l) => l.fee_head === feeHead);
  if (!line) return false;
  StudentFee.setDiscount(line.id, Number(line.discount || 0) + Number(amount));
  return true;
}

const DiscountController = {
  list(req, res) {
    const { page, perPage, offset } = paginate(req.query, 20);
    const branchId = scope(req);
    const status = STATUSES.includes(req.query.status) ? req.query.status : undefined;

    const rows = Discount.all({ branchId, status, limit: perPage, offset });
    const total = Discount.count({ branchId, status });

    res.render('discounts/list', {
      title: 'Discounts',
      discounts: rows,
      total,
      page, pages: pageCount(total, perPage),
      baseQuery: req.query,
      branches: pickableBranches(req),
      statuses: STATUSES,
    });
  },

  newForm(req, res) {
    res.render('discounts/form', {
      title: 'Request Discount',
      feeHeads: FeeHead.all({ activeOnly: true }),
    });
  },

  create(req, res) {
    const uid = clean(req.body.student_uid);
    const student = uid ? Student.findByUniqueId(uid) : null;
    if (!student) {
      req.flash('error', `No student found with ID "${clean(req.body.student_uid) || ''}".`);
      return res.redirect('/discounts/new');
    }
    // Scoped users may only discount their own branch's students.
    if (req.branchScopeId && student.branch_id !== req.branchScopeId) {
      req.flash('error', 'That student belongs to another branch.');
      return res.redirect('/discounts/new');
    }

    const feeHead = clean(req.body.fee_head);
    const amount = parseFloat(req.body.amount) || 0;
    const reason = clean(req.body.reason);
    if (amount <= 0) {
      req.flash('error', 'Enter a discount amount greater than zero.');
      return res.redirect('/discounts/new');
    }

    const branchId = req.branchScopeId || student.branch_id;

    // Decide whether this needs approval or can auto-approve.
    let status = 'approved';
    if (Setting.bool('discount_needs_approval')) {
      status = Setting.num('discount_auto_approve_upto') >= amount ? 'approved' : 'pending';
    }

    // Link to the matching ledger line if there is one (also used to apply it).
    const line = feeHead ? StudentFee.forStudent(student.id).find((l) => l.fee_head === feeHead) : null;

    const id = Discount.create({
      student_id: student.id,
      sf_id: line ? line.id : null,
      fee_head: feeHead,
      amount,
      reason,
      status,
      branch_id: branchId,
      requested_by: req.user.id,
    });

    let applied = false;
    if (status === 'approved') {
      // Stamp the approver/decided_at and apply to the ledger straight away.
      Discount.decide(id, 'approved', req.user.id);
      applied = applyToLedger(student.id, feeHead, amount);
    }

    Audit.log(req, 'INSERT', 'discounts', id, null,
      { student: student.unique_id, fee_head: feeHead, amount, status });

    if (status === 'approved') {
      req.flash('success',
        `Discount of ${h_money(res, amount)} approved for ${student.name}.` +
        (applied ? ' Applied to the fee ledger.' : ' No matching ledger line — recorded only.'));
    } else {
      req.flash('success', `Discount request for ${student.name} submitted for approval.`);
    }
    res.redirect('/discounts');
  },

  approve(req, res) {
    const d = Discount.findById(req.params.id);
    if (!d) { req.flash('error', 'Discount request not found.'); return res.redirect('/discounts'); }
    if (req.branchScopeId && d.branch_id !== req.branchScopeId) {
      req.flash('error', 'That discount belongs to another branch.'); return res.redirect('/discounts');
    }
    if (d.status !== 'pending') {
      req.flash('info', `This request is already ${d.status}.`); return res.redirect('/discounts');
    }

    Discount.decide(d.id, 'approved', req.user.id);
    const applied = applyToLedger(d.student_id, d.fee_head, d.amount);
    Audit.log(req, 'UPDATE', 'discounts', d.id, { status: 'pending' }, { status: 'approved' });
    req.flash('success',
      `Discount approved.` + (applied ? ' Applied to the fee ledger.' : ' No matching ledger line — recorded only.'));
    res.redirect('/discounts');
  },

  reject(req, res) {
    const d = Discount.findById(req.params.id);
    if (!d) { req.flash('error', 'Discount request not found.'); return res.redirect('/discounts'); }
    if (req.branchScopeId && d.branch_id !== req.branchScopeId) {
      req.flash('error', 'That discount belongs to another branch.'); return res.redirect('/discounts');
    }
    if (d.status !== 'pending') {
      req.flash('info', `This request is already ${d.status}.`); return res.redirect('/discounts');
    }

    Discount.decide(d.id, 'rejected', req.user.id);
    Audit.log(req, 'UPDATE', 'discounts', d.id, { status: 'pending' }, { status: 'rejected' });
    req.flash('success', 'Discount request rejected.');
    res.redirect('/discounts');
  },
};

/** Currency formatting using the request's view helpers/currency. */
function h_money(res, amount) {
  return res.locals.h.money(amount, res.locals.currency);
}

module.exports = DiscountController;
