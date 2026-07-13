'use strict';

const Student = require('../models/student');
const Branch = require('../models/branch');
const Fee = require('../services/fee');
const Collection = require('../services/collection');
const { clean } = require('../utils/helpers');

function pickableBranches(req) {
  if (req.branchScopeId) { const b = Branch.findById(req.branchScopeId); return b ? [b] : []; }
  return Branch.all({ activeOnly: true });
}

const CollectionController = {
  index(req, res) {
    const q = clean(req.query.q);
    const studentId = parseInt(req.query.student, 10) || null;
    let results = [];
    let student = null;
    let summary = null;

    if (studentId) {
      student = Student.findById(studentId);
      if (student && !student.deleted_at) summary = Fee.summary(student.id);
      else student = null;
    } else if (q) {
      // Receptionists/accountants can look up any branch's student for
      // cross-branch collection, so search is intentionally not branch-scoped.
      results = Student.search(q, { limit: 20 });
    }

    res.render('collection/index', {
      title: 'Fee Collection',
      q, results, student, summary,
      collectBranches: pickableBranches(req),
      defaultCollectBranchId: req.branchScopeId || (student ? student.branch_id : null),
    });
  },

  collect(req, res) {
    const studentId = parseInt(req.body.student_id, 10);
    const student = Student.findById(studentId);
    if (!student) { req.flash('error', 'Student not found.'); return res.redirect('/collection'); }

    const collectingBranchId = req.branchScopeId || parseInt(req.body.collecting_branch_id, 10) || student.branch_id;
    try {
      const result = Collection.collect({
        req,
        studentId,
        payAmount: parseFloat(req.body.amount),
        mode: clean(req.body.payment_mode) || 'cash',
        referenceNo: clean(req.body.reference_no),
        remarks: clean(req.body.remarks),
        paidOn: clean(req.body.paid_on),
        collectingBranchId,
      });
      req.flash('success',
        `Payment recorded. Receipt ${result.receiptNo}${result.crossBranch ? ' (cross-branch)' : ''}. Remaining due: ${result.remainingDue.toFixed(2)}.`);
      res.redirect(`/receipts/${result.receiptId}?new=1`);
    } catch (err) {
      req.flash('error', err.message || 'Could not record payment.');
      res.redirect(`/collection?student=${studentId}`);
    }
  },
};

module.exports = CollectionController;
