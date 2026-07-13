'use strict';

const FeeStructure = require('../models/feeStructure');
const Course = require('../models/course');
const FeeHead = require('../models/feeHead');
const Branch = require('../models/branch');
const Setting = require('../models/setting');
const Audit = require('../services/audit');
const { clean } = require('../utils/helpers');

/** Branches this user may pick from (scoped roles only ever see their own). */
function pickableBranches(req) {
  if (req.branchScopeId) {
    const b = Branch.findById(req.branchScopeId);
    return b ? [b] : [];
  }
  return Branch.all({ activeOnly: true });
}

/** URL of the group-detail page a save/delete should return to. */
function groupUrl({ course_id, semester, academic_year }) {
  let url = `/structures/group?course=${course_id}&semester=${semester}`;
  if (academic_year) url += `&year=${encodeURIComponent(academic_year)}`;
  return url;
}

const StructureController = {
  // LIST — distinct (course, semester, year) groups with head counts & totals.
  list(req, res) {
    const courseId = parseInt(req.query.course, 10) || null;
    let groups = FeeStructure.groups();
    if (courseId) groups = groups.filter((g) => g.course_id === courseId);
    res.render('structures/list', {
      title: 'Fee Structures',
      groups,
      courses: Course.all(),
    });
  },

  // GROUP — every fee head defined for one course + semester (+ year).
  group(req, res) {
    const courseId = parseInt(req.query.course, 10) || null;
    const semester = parseInt(req.query.semester, 10) || null;
    const academicYear = clean(req.query.year);
    if (!courseId || !semester) {
      req.flash('error', 'Choose a course and semester to view its fee structure.');
      return res.redirect('/structures');
    }
    const rows = FeeStructure.forCourseSemester(courseId, semester, academicYear);
    const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    res.render('structures/group', {
      title: 'Fee Structure',
      course: Course.findById(courseId),
      semester, academicYear,
      rows, total,
    });
  },

  // FORM — create a single fee line (optionally pre-filled for a group).
  newForm(req, res) {
    const line = {
      course_id: parseInt(req.query.course, 10) || null,
      semester: parseInt(req.query.semester, 10) || 1,
      academic_year: clean(req.query.year) || Setting.get('academic_year'),
      late_fee_per_day: Setting.num('late_fee_per_day', 0),
    };
    res.render('structures/form', {
      title: 'Add Fee Line', line, isEdit: false,
      courses: Course.all({ activeOnly: true }),
      heads: FeeHead.all({ activeOnly: true }),
      branches: pickableBranches(req),
    });
  },

  editForm(req, res) {
    const line = FeeStructure.findById(req.params.id);
    if (!line) { req.flash('error', 'Fee line not found.'); return res.redirect('/structures'); }
    res.render('structures/form', {
      title: 'Edit Fee Line', line, isEdit: true,
      courses: Course.all({ activeOnly: true }),
      heads: FeeHead.all({ activeOnly: true }),
      branches: pickableBranches(req),
    });
  },

  create(req, res) {
    const data = collect(req, req.body);
    if (!data.course_id || !data.semester || !data.fee_head) {
      req.flash('error', 'Course, semester and fee head are required.');
      return res.redirect('/structures/new');
    }
    const id = FeeStructure.create(data);
    Audit.log(req, 'INSERT', 'fee_structures', id, null, { fee_head: data.fee_head, amount: data.amount });
    req.flash('success', `Fee line "${data.fee_head}" added.`);
    res.redirect(groupUrl(data));
  },

  update(req, res) {
    const line = FeeStructure.findById(req.params.id);
    if (!line) { req.flash('error', 'Fee line not found.'); return res.redirect('/structures'); }
    const data = collect(req, req.body);
    FeeStructure.update(line.id, {
      fee_head_id: data.fee_head_id,
      fee_head: data.fee_head,
      amount: data.amount,
      due_date: data.due_date,
      late_fee_per_day: data.late_fee_per_day,
    });
    Audit.log(req, 'UPDATE', 'fee_structures', line.id, { amount: line.amount }, { amount: data.amount });
    req.flash('success', `Fee line "${data.fee_head}" updated.`);
    // Course/semester/year cannot change on edit — use the stored row for the redirect.
    res.redirect(groupUrl(line));
  },

  destroy(req, res) {
    const line = FeeStructure.findById(req.params.id);
    if (!line) { req.flash('error', 'Fee line not found.'); return res.redirect('/structures'); }
    FeeStructure.remove(line.id);
    Audit.log(req, 'DELETE', 'fee_structures', line.id, { fee_head: line.fee_head, amount: line.amount }, null);
    req.flash('success', `Fee line "${line.fee_head}" removed.`);
    res.redirect(groupUrl(line));
  },
};

/**
 * Normalise form input into a FeeStructure payload. The fee-head name is
 * resolved from its id so both are stored (the name is copied onto each
 * student's ledger, the id keeps the link to the fee_heads table).
 */
function collect(req, body) {
  const feeHeadId = parseInt(body.fee_head_id, 10) || null;
  const head = feeHeadId ? FeeHead.findById(feeHeadId) : null;
  return {
    course_id: parseInt(body.course_id, 10) || null,
    semester: parseInt(body.semester, 10) || 1,
    fee_head_id: feeHeadId,
    fee_head: head ? head.name : clean(body.fee_head),
    amount: parseFloat(body.amount) || 0,
    due_date: clean(body.due_date),
    academic_year: clean(body.academic_year),
    branch_id: req.branchScopeId || parseInt(body.branch_id, 10) || null,
    late_fee_per_day: parseFloat(body.late_fee_per_day) || 0,
  };
}

module.exports = StructureController;
