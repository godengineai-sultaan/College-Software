'use strict';

const ExamForm = require('../models/examForm');
const Student = require('../models/student');
const Branch = require('../models/branch');
const Audit = require('../services/audit');
const { paginate, pageCount, clean } = require('../utils/helpers');
const { EXAM_TYPES } = require('../config/constants');

/** Resolve the branch a query should be scoped to. */
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

// Exam-form workflow statuses. Progress % is derived via ExamForm.progressFor.
const STATUSES = [
  { value: 'draft',     label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved',  label: 'Approved' },
  { value: 'paid',      label: 'Paid' },
  { value: 'rejected',  label: 'Rejected' },
];

const ExamFormController = {
  list(req, res) {
    const { page, perPage, offset } = paginate(req.query, 20);
    const filter = {
      branchId: scope(req),
      examType: clean(req.query.exam_type) || undefined,
      status: clean(req.query.status) || undefined,
      search: clean(req.query.q) || undefined,
      limit: perPage, offset,
    };
    const rows = ExamForm.all(filter);
    const total = ExamForm.count(filter);
    res.render('examforms/list', {
      title: 'Exam Forms',
      forms: rows, total,
      page, pages: pageCount(total, perPage),
      baseQuery: req.query,
      branches: pickableBranches(req),
      examTypes: EXAM_TYPES,
      statuses: STATUSES,
    });
  },

  newForm(req, res) {
    res.render('examforms/form', {
      title: 'New Exam Form',
      form: {}, isEdit: false,
      examTypes: EXAM_TYPES,
      statuses: STATUSES,
    });
  },

  create(req, res) {
    const uid = clean(req.body.student_uid);
    if (!uid) { req.flash('error', 'Please enter a student ID.'); return res.redirect('/examforms/new'); }
    // Resolve the student by their unique id; reject if unknown/deleted.
    const student = Student.findByUniqueId(uid);
    if (!student || student.deleted_at) {
      req.flash('error', `No student found with ID "${uid}".`);
      return res.redirect('/examforms/new');
    }
    // Branch-scoped users may only file forms for their own branch's students.
    if (req.branchScopeId && student.branch_id !== req.branchScopeId) {
      req.flash('error', 'That student belongs to another branch.');
      return res.redirect('/examforms/new');
    }
    const status = clean(req.body.status) || 'submitted';
    const data = collect(req.body);
    data.student_id = student.id;
    data.branch_id = student.branch_id || req.branchScopeId;
    data.status = status;
    data.progress = ExamForm.progressFor(status);
    const { id, form_no } = ExamForm.create(data, req.user.id);
    Audit.log(req, 'INSERT', 'exam_forms', id, null, { form_no, student: student.unique_id, exam_type: data.exam_type });
    req.flash('success', `Exam form ${form_no} created for ${student.name}.`);
    res.redirect(`/examforms/${id}`);
  },

  show(req, res) {
    const form = ExamForm.findById(req.params.id);
    if (!form) { req.flash('error', 'Exam form not found.'); return res.redirect('/examforms'); }
    if (req.branchScopeId && form.branch_id !== req.branchScopeId) {
      return res.status(403).render('errors/403', { title: 'Access denied', layout: 'layouts/auth' });
    }
    res.render('examforms/show', {
      title: form.form_no,
      form,
      examTypes: EXAM_TYPES,
      statuses: STATUSES,
    });
  },

  editForm(req, res) {
    const form = ExamForm.findById(req.params.id);
    if (!form) { req.flash('error', 'Exam form not found.'); return res.redirect('/examforms'); }
    res.render('examforms/form', {
      title: 'Edit Exam Form',
      form, isEdit: true,
      examTypes: EXAM_TYPES,
      statuses: STATUSES,
    });
  },

  update(req, res) {
    const form = ExamForm.findById(req.params.id);
    if (!form) { req.flash('error', 'Exam form not found.'); return res.redirect('/examforms'); }
    const status = clean(req.body.status) || form.status;
    const data = collect(req.body);
    data.status = status;
    data.progress = ExamForm.progressFor(status);
    ExamForm.update(form.id, data);
    Audit.log(req, 'UPDATE', 'exam_forms', form.id, { status: form.status }, { status });
    req.flash('success', `Exam form ${form.form_no} updated.`);
    res.redirect(`/examforms/${form.id}`);
  },

  // Quick status-advance from the detail view.
  status(req, res) {
    const form = ExamForm.findById(req.params.id);
    if (!form) { req.flash('error', 'Exam form not found.'); return res.redirect('/examforms'); }
    const status = clean(req.body.status);
    if (!status) { req.flash('error', 'No status supplied.'); return res.redirect(`/examforms/${form.id}`); }
    ExamForm.update(form.id, { status, progress: ExamForm.progressFor(status) });
    Audit.log(req, 'UPDATE', 'exam_forms', form.id, { status: form.status }, { status });
    req.flash('success', `Exam form ${form.form_no} marked ${status}.`);
    res.redirect(`/examforms/${form.id}`);
  },

  remove(req, res) {
    const form = ExamForm.findById(req.params.id);
    if (form) {
      ExamForm.remove(form.id);
      Audit.log(req, 'DELETE', 'exam_forms', form.id, { form_no: form.form_no }, null);
      req.flash('success', `Exam form ${form.form_no} deleted.`);
    }
    res.redirect('/examforms');
  },
};

function collect(body) {
  return {
    exam_type: clean(body.exam_type) || 'regular',
    session: clean(body.session),
    semester: parseInt(body.semester, 10) || null,
    subjects: clean(body.subjects),
    fee_amount: parseFloat(body.fee_amount) || 0,
    paid: body.paid ? 1 : 0,
  };
}

module.exports = ExamFormController;
