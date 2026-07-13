'use strict';

const Course = require('../models/course');
const FeeHead = require('../models/feeHead');
const Audit = require('../services/audit');
const { clean } = require('../utils/helpers');

const CourseController = {
  // INDEX — courses and fee heads managed together on one page.
  index(req, res) {
    res.render('courses/index', {
      title: 'Courses & Fee Heads',
      courses: Course.withCounts(),
      heads: FeeHead.all(),
    });
  },

  // ---- Courses -------------------------------------------------------------
  newForm(req, res) {
    res.render('courses/form', { title: 'Add Course', course: {}, isEdit: false });
  },

  editForm(req, res) {
    const course = Course.findById(req.params.id);
    if (!course) { req.flash('error', 'Course not found.'); return res.redirect('/courses'); }
    res.render('courses/form', { title: 'Edit Course', course, isEdit: true });
  },

  create(req, res) {
    const data = collect(req.body);
    if (!data.name || !data.code) {
      req.flash('error', 'Course name and code are required.');
      return res.redirect('/courses/new');
    }
    const id = Course.create(data);
    Audit.log(req, 'INSERT', 'courses', id, null, { name: data.name, code: data.code });
    req.flash('success', `Course "${data.name}" added.`);
    res.redirect('/courses');
  },

  update(req, res) {
    const course = Course.findById(req.params.id);
    if (!course) { req.flash('error', 'Course not found.'); return res.redirect('/courses'); }
    const data = collect(req.body);
    if (!data.name || !data.code) {
      req.flash('error', 'Course name and code are required.');
      return res.redirect(`/courses/${course.id}/edit`);
    }
    Course.update(course.id, data);
    Audit.log(req, 'UPDATE', 'courses', course.id, { name: course.name, code: course.code }, { name: data.name, code: data.code });
    req.flash('success', `Course "${data.name}" updated.`);
    res.redirect('/courses');
  },

  destroy(req, res) {
    const course = Course.findById(req.params.id);
    if (!course) { req.flash('error', 'Course not found.'); return res.redirect('/courses'); }
    try {
      Course.remove(course.id);
      Audit.log(req, 'DELETE', 'courses', course.id, { name: course.name, code: course.code }, null);
      req.flash('success', `Course "${course.name}" deleted.`);
    } catch (e) {
      req.flash('error', 'Could not delete this course — it may still be linked to students or fee structures.');
    }
    res.redirect('/courses');
  },

  // ---- Fee heads -----------------------------------------------------------
  createHead(req, res) {
    const name = clean(req.body.name);
    if (!name) { req.flash('error', 'Fee head name is required.'); return res.redirect('/courses'); }
    const id = FeeHead.create({
      name,
      code: clean(req.body.code),
      sort_order: parseInt(req.body.sort_order, 10) || 0,
    });
    Audit.log(req, 'INSERT', 'fee_heads', id, null, { name });
    req.flash('success', `Fee head "${name}" added.`);
    res.redirect('/courses');
  },

  destroyHead(req, res) {
    const head = FeeHead.findById(req.params.id);
    if (!head) { req.flash('error', 'Fee head not found.'); return res.redirect('/courses'); }
    try {
      FeeHead.remove(head.id);
      Audit.log(req, 'DELETE', 'fee_heads', head.id, { name: head.name }, null);
      req.flash('success', `Fee head "${head.name}" deleted.`);
    } catch (e) {
      req.flash('error', 'Could not delete this fee head — it may be in use by a fee structure.');
    }
    res.redirect('/courses');
  },
};

function collect(body) {
  return {
    name: clean(body.name),
    code: clean(body.code),
    duration_years: parseInt(body.duration_years, 10) || 3,
    total_semesters: parseInt(body.total_semesters, 10) || 6,
    description: clean(body.description),
    is_active: body.is_active ? 1 : 0,
  };
}

module.exports = CourseController;
