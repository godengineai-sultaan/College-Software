'use strict';

const Student = require('../models/student');
const Branch = require('../models/branch');
const Course = require('../models/course');
const Receipt = require('../models/receipt');
const ExamForm = require('../models/examForm');
const Fee = require('../services/fee');
const Audit = require('../services/audit');
const csv = require('../utils/csv');
const { paginate, pageCount, clean } = require('../utils/helpers');
const { STUDENT_STATUS } = require('../config/constants');

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

const StudentController = {
  list(req, res) {
    const { page, perPage, offset } = paginate(req.query, 20);
    const filter = {
      branchId: scope(req),
      courseId: parseInt(req.query.course, 10) || undefined,
      semester: parseInt(req.query.semester, 10) || undefined,
      status: clean(req.query.status) || undefined,
      search: clean(req.query.q) || undefined,
      limit: perPage, offset,
    };
    const rows = Student.all(filter);
    const total = Student.count(filter);
    res.render('students/list', {
      title: 'Students',
      students: rows,
      total,
      page, pages: pageCount(total, perPage),
      baseQuery: req.query,
      branches: pickableBranches(req),
      courses: Course.all({ activeOnly: true }),
      statuses: STUDENT_STATUS,
      trashCount: Student.count({ includeDeleted: true, branchId: scope(req) }),
    });
  },

  newForm(req, res) {
    res.render('students/form', {
      title: 'Add Student',
      student: {}, isEdit: false,
      branches: pickableBranches(req),
      courses: Course.all({ activeOnly: true }),
      statuses: STUDENT_STATUS,
    });
  },

  create(req, res) {
    const data = collect(req.body);
    data.branch_id = req.branchScopeId || parseInt(req.body.branch_id, 10);
    if (!data.name || !data.branch_id) {
      req.flash('error', 'Name and branch are required.');
      return res.redirect('/students/new');
    }
    const { id, unique_id } = Student.create(data, req.user.id);
    // Auto-generate the fee ledger from the course/semester structure.
    const student = Student.findById(id);
    const created = Fee.assignStructureToStudent(student);
    Audit.log(req, 'INSERT', 'students', id, null, { unique_id, name: data.name });
    req.flash('success', `Student ${data.name} added as ${unique_id}.` + (created ? ` ${created} fee line(s) assigned.` : ''));
    res.redirect(`/students/${id}`);
  },

  show(req, res) {
    const student = Student.findById(req.params.id);
    if (!student || student.deleted_at) { req.flash('error', 'Student not found.'); return res.redirect('/students'); }
    if (req.branchScopeId && student.branch_id !== req.branchScopeId) {
      return res.status(403).render('errors/403', { title: 'Access denied', layout: 'layouts/auth' });
    }
    res.render('students/show', {
      title: student.name,
      student,
      summary: Fee.summary(student.id),
      receipts: Receipt.forStudent(student.id),
      examForms: ExamForm.all({ search: student.unique_id, limit: 50 }),
    });
  },

  editForm(req, res) {
    const student = Student.findById(req.params.id);
    if (!student) { req.flash('error', 'Student not found.'); return res.redirect('/students'); }
    res.render('students/form', {
      title: 'Edit Student', student, isEdit: true,
      branches: pickableBranches(req),
      courses: Course.all({ activeOnly: true }),
      statuses: STUDENT_STATUS,
    });
  },

  update(req, res) {
    const student = Student.findById(req.params.id);
    if (!student) { req.flash('error', 'Student not found.'); return res.redirect('/students'); }
    const data = collect(req.body);
    Student.update(student.id, data);
    Audit.log(req, 'UPDATE', 'students', student.id, { name: student.name }, { name: data.name });
    req.flash('success', 'Student details updated.');
    res.redirect(`/students/${student.id}`);
  },

  softDelete(req, res) {
    const student = Student.findById(req.params.id);
    if (student) {
      Student.softDelete(student.id);
      Audit.log(req, 'DELETE', 'students', student.id, { unique_id: student.unique_id }, { soft: true });
      req.flash('success', `${student.name} moved to trash. You can restore them anytime.`);
    }
    res.redirect('/students');
  },

  trash(req, res) {
    const rows = Student.all({ includeDeleted: true, branchId: scope(req), limit: 200 });
    res.render('students/trash', { title: 'Deleted Students', students: rows });
  },

  restore(req, res) {
    const student = Student.findById(req.params.id);
    if (student) {
      Student.restore(student.id);
      Audit.log(req, 'UPDATE', 'students', student.id, { soft_deleted: true }, { restored: true });
      req.flash('success', `${student.name} restored.`);
    }
    res.redirect('/students/trash');
  },

  // ---- Bulk upload (Flow 1) ------------------------------------------------
  bulkForm(req, res) {
    res.render('students/bulk', {
      title: 'Bulk Upload Students',
      branches: pickableBranches(req),
      courses: Course.all({ activeOnly: true }),
      report: null,
    });
  },

  template(req, res) {
    const headers = ['name', 'roll_no', 'course_code', 'semester', 'gender', 'dob', 'phone', 'email', 'guardian_name', 'guardian_phone', 'category', 'city', 'state'];
    const sample = [['Rahul Sharma', '101', 'BCOM', '1', 'Male', '2005-06-15', '9876543210', 'rahul@example.com', 'Ramesh Sharma', '9998887776', 'General', 'Bengaluru', 'Karnataka']];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="student_upload_template.csv"');
    res.send(csv.build(headers, sample));
  },

  bulkUpload(req, res) {
    const branchId = req.branchScopeId || parseInt(req.body.branch_id, 10);
    if (!branchId) { req.flash('error', 'Please choose a branch for the upload.'); return res.redirect('/students/bulk'); }
    if (!req.file) { req.flash('error', 'Please choose a CSV file.'); return res.redirect('/students/bulk'); }

    let records;
    try {
      records = csv.parseObjects(req.file.buffer.toString('utf8'));
    } catch (e) {
      req.flash('error', 'Could not read the CSV file.'); return res.redirect('/students/bulk');
    }

    const courses = Course.all();
    const courseByCode = {};
    courses.forEach((c) => { courseByCode[c.code.toUpperCase()] = c; });

    const report = { total: records.length, inserted: 0, errors: [], duplicates: [] };
    const academicYear = require('../models/setting').get('academic_year');

    // Validation engine + batch insert.
    records.forEach((row, idx) => {
      const line = idx + 2; // header is line 1
      const name = (row.name || '').trim();
      if (!name) { report.errors.push({ line, message: 'Missing name' }); return; }
      const code = (row.course_code || '').trim().toUpperCase();
      const course = code ? courseByCode[code] : null;
      if (code && !course) { report.errors.push({ line, message: `Unknown course code "${code}"` }); return; }
      // Duplicate check: same name + phone in the same branch.
      if (row.phone) {
        const dup = require('../db/connection').get(
          'SELECT unique_id FROM students WHERE branch_id = ? AND phone = ? AND deleted_at IS NULL',
          [branchId, row.phone.trim()]);
        if (dup) { report.duplicates.push({ line, name, existing: dup.unique_id }); return; }
      }
      try {
        const { unique_id } = Student.create({
          name,
          roll_no: clean(row.roll_no),
          course_id: course ? course.id : null,
          course_name: course ? course.name : null,
          semester: parseInt(row.semester, 10) || 1,
          branch_id: branchId,
          academic_year: academicYear,
          gender: clean(row.gender),
          dob: clean(row.dob),
          phone: clean(row.phone),
          email: clean(row.email),
          category: clean(row.category),
          city: clean(row.city),
          state: clean(row.state),
          guardian_name: clean(row.guardian_name),
          guardian_phone: clean(row.guardian_phone),
          guardian_relation: 'Guardian',
          status: 'active',
        }, req.user.id);
        // Assign fees for imported students too.
        if (course) Fee.assignStructureToStudent(Student.findByUniqueId(unique_id));
        report.inserted += 1;
      } catch (e) {
        report.errors.push({ line, message: e.message });
      }
    });

    Audit.log(req, 'BULK_INSERT', 'students', null, null, { count: report.inserted });
    res.render('students/bulk', {
      title: 'Bulk Upload Students',
      branches: pickableBranches(req),
      courses: Course.all({ activeOnly: true }),
      report,
    });
  },

  // Re-generate the fee ledger for a student's current semester.
  assignFees(req, res) {
    const student = Student.findById(req.params.id);
    if (student) {
      const n = Fee.assignStructureToStudent(student);
      req.flash(n ? 'success' : 'info', n ? `${n} fee line(s) assigned.` : 'No new fee lines to assign (already up to date).');
    }
    res.redirect(`/students/${req.params.id}`);
  },
};

function collect(body) {
  return {
    name: clean(body.name),
    roll_no: clean(body.roll_no),
    course_id: parseInt(body.course_id, 10) || null,
    semester: parseInt(body.semester, 10) || 1,
    academic_year: clean(body.academic_year),
    admission_date: clean(body.admission_date),
    gender: clean(body.gender),
    dob: clean(body.dob),
    category: clean(body.category),
    phone: clean(body.phone),
    email: clean(body.email),
    address: clean(body.address),
    city: clean(body.city),
    state: clean(body.state),
    guardian_name: clean(body.guardian_name),
    guardian_phone: clean(body.guardian_phone),
    guardian_relation: clean(body.guardian_relation),
    status: clean(body.status) || 'active',
  };
}

module.exports = StudentController;
