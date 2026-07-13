'use strict';

/**
 * Seeds the WSchools Dual-Branch College Fee Management System with a realistic
 * working demo: two branches, six role accounts, courses, fee heads & structures,
 * students across both branches, ledgers, receipts (incl. a cross-branch
 * payment), expenses, exam forms and discounts.
 *
 *   npm run seed         (safe: skips if data already exists)
 */

const db = require('./connection');
const config = require('../config');
const { hashPassword } = require('../utils/helpers');
const { DEFAULT_FEE_HEADS } = require('../config/constants');

const Setting = require('../models/setting');
const Branch = require('../models/branch');
const Course = require('../models/course');
const FeeHead = require('../models/feeHead');
const FeeStructure = require('../models/feeStructure');
const Student = require('../models/student');
const Fee = require('../services/fee');
const Collection = require('../services/collection');
const Expense = require('../models/expense');
const ExamForm = require('../models/examForm');
const Discount = require('../models/discount');
const Notify = require('../services/notify');

function seed() {
  if (db.get('SELECT COUNT(*) AS c FROM students').c > 0) {
    console.log('• Demo data already present — skipping seed.');
    ensureSuperAdmin();
    return;
  }
  console.log('• Seeding WSchools Fee Management demo data...');

  Setting.setMany({
    institution_name: 'WSchools College of Higher Education',
    institution_short: 'WSchools',
    institution_address: 'Knowledge Park, Education City - 560001',
    institution_phone: '+91 80 4567 0000',
    institution_email: 'accounts@wschools.edu',
    institution_website: 'www.wschools.edu',
    currency_symbol: '₹',
    academic_year: '2025-2026',
    late_fee_enabled: '1',
    late_fee_per_day: '10',
    late_fee_max: '2000',
  });

  // ---- Branches ------------------------------------------------------------
  const brA = Branch.create({ branch_code: 'A', name: 'Main Campus', address: 'Knowledge Park, Education City', phone: '+91 80 4567 0001', email: 'campusa@wschools.edu' });
  const brB = Branch.create({ branch_code: 'B', name: 'City Campus', address: 'Downtown Road, Education City', phone: '+91 80 4567 0002', email: 'campusb@wschools.edu' });
  const branchA = Branch.findById(brA);
  const branchB = Branch.findById(brB);

  // ---- Users (6 roles) -----------------------------------------------------
  const superId = ensureSuperAdmin();
  createUser('admin_a', 'Branch Admin (A)', 'branch_admin', brA, 'Admin@123');
  createUser('admin_b', 'Branch Admin (B)', 'branch_admin', brB, 'Admin@123');
  const accId = createUser('accountant', 'Accounts Officer', 'accountant', brA, 'Account@123');
  const recA = createUser('reception', 'Front Desk (A)', 'receptionist', brA, 'Reception@123');
  createUser('viewer', 'Read-Only Viewer', 'viewer', null, 'Viewer@123');

  // ---- Academic year -------------------------------------------------------
  db.run(`INSERT INTO academic_years (name, start_date, end_date, is_current) VALUES (?,?,?,1)`,
    ['2025-2026', '2025-07-01', '2026-06-30']);

  // ---- Fee heads -----------------------------------------------------------
  const headIds = {};
  DEFAULT_FEE_HEADS.forEach((name, i) => { headIds[name] = FeeHead.create({ name, sort_order: i + 1 }); });

  // ---- Courses -------------------------------------------------------------
  const cBCom = Course.create({ name: 'B.Com', code: 'BCOM', duration_years: 3, total_semesters: 6 });
  const cBCA = Course.create({ name: 'BCA', code: 'BCA', duration_years: 3, total_semesters: 6 });
  const cBTech = Course.create({ name: 'B.Tech (CSE)', code: 'BTECHCSE', duration_years: 4, total_semesters: 8 });
  const cBBA = Course.create({ name: 'BBA', code: 'BBA', duration_years: 3, total_semesters: 6 });

  // ---- Fee structures (dynamic heads per course/semester) ------------------
  // amounts per head; due dates; late fee ₹10/day.
  const structureFor = (courseId, semester, heads) => {
    heads.forEach(([headName, amount]) => {
      FeeStructure.create({
        course_id: courseId, semester, fee_head_id: headIds[headName], fee_head: headName,
        amount, due_date: '2025-08-15', academic_year: '2025-2026', branch_id: null, late_fee_per_day: 10,
      });
    });
  };
  const bcomHeads = [['Tuition Fee', 25000], ['Admission Fee', 5000], ['Examination Fee', 2000], ['Library Fee', 1500], ['Development Fee', 3000]];
  const bcaHeads = [['Tuition Fee', 35000], ['Admission Fee', 6000], ['Examination Fee', 2500], ['Laboratory Fee', 4000], ['Library Fee', 1500], ['Development Fee', 3500]];
  const btechHeads = [['Tuition Fee', 60000], ['Admission Fee', 8000], ['Examination Fee', 3000], ['Laboratory Fee', 6000], ['Library Fee', 2000], ['Development Fee', 5000]];
  const bbaHeads = [['Tuition Fee', 30000], ['Admission Fee', 5000], ['Examination Fee', 2000], ['Library Fee', 1500], ['Development Fee', 3000]];
  [1, 3].forEach((sem) => {
    structureFor(cBCom, sem, bcomHeads);
    structureFor(cBCA, sem, bcaHeads);
    structureFor(cBTech, sem, btechHeads);
    structureFor(cBBA, sem, bbaHeads);
  });

  // ---- Students across both branches --------------------------------------
  const first = ['Aarav', 'Vivaan', 'Aditya', 'Diya', 'Ananya', 'Ishaan', 'Kabir', 'Sara', 'Rohan', 'Nisha',
    'Arjun', 'Riya', 'Karan', 'Pooja', 'Dev', 'Tara', 'Yash', 'Neha', 'Manav', 'Kavya',
    'Advik', 'Myra', 'Reyansh', 'Anvi', 'Vihaan'];
  const last = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Reddy', 'Iyer', 'Nair', 'Das', 'Bose', 'Khan'];
  const courses = [
    { id: cBCom, name: 'B.Com' }, { id: cBCA, name: 'BCA' },
    { id: cBTech, name: 'B.Tech (CSE)' }, { id: cBBA, name: 'BBA' },
  ];
  const students = [];
  for (let i = 0; i < 25; i++) {
    const branchId = i % 2 === 0 ? brA : brB;
    const course = courses[i % courses.length];
    const semester = i % 3 === 0 ? 3 : 1;
    const created = Student.create({
      name: `${first[i]} ${last[i % last.length]}`,
      roll_no: String(100 + i),
      course_id: course.id,
      semester,
      branch_id: branchId,
      academic_year: '2025-2026',
      admission_date: '2025-07-05',
      gender: i % 3 === 0 ? 'Female' : 'Male',
      dob: `2005-0${(i % 9) + 1}-1${i % 9}`,
      category: ['General', 'OBC', 'SC', 'ST'][i % 4],
      phone: `98${String(76500000 + i)}`,
      email: `${first[i].toLowerCase()}.${last[i % last.length].toLowerCase()}@student.wschools.edu`,
      city: ['Bengaluru', 'Chennai', 'Mumbai', 'Delhi'][i % 4],
      state: ['Karnataka', 'Tamil Nadu', 'Maharashtra', 'Delhi'][i % 4],
      guardian_name: `${['Ramesh', 'Suresh', 'Mahesh', 'Dinesh'][i % 4]} ${last[i % last.length]}`,
      guardian_phone: `99${String(88800000 + i)}`,
      guardian_relation: 'Father',
      status: 'active',
    }, superId);
    // Assign fee structure → ledger.
    const student = Student.findById(created.id);
    Fee.assignStructureToStudent(student);
    students.push(student);
  }

  // ---- Receipts (real collection flow: allocation, sync, notification) -----
  students.forEach((st, i) => {
    const summary = Fee.summary(st.id);
    if (summary.due <= 0) return;
    const mode = ['cash', 'upi', 'card', 'netbanking', 'cheque', 'dd'][i % 6];
    const r = i % 4;
    if (r === 0) {
      // full payment at own branch
      Collection.collect({ req: null, studentId: st.id, payAmount: summary.due, mode,
        collectingBranchId: st.branch_id, collectedBy: accId, paidOn: '2025-08-10' });
    } else if (r === 1) {
      // CROSS-BRANCH: these are Branch B students paying at Branch A.
      Collection.collect({ req: null, studentId: st.id, payAmount: Math.round(summary.due * 0.5), mode: 'cash',
        collectingBranchId: brA, collectedBy: recA, paidOn: '2025-08-14', remarks: 'Paid at Main Campus (cross-branch)' });
    } else if (r === 2) {
      // partial payment (~40%) at own branch
      Collection.collect({ req: null, studentId: st.id, payAmount: Math.round(summary.due * 0.4), mode,
        collectingBranchId: st.branch_id, collectedBy: accId, paidOn: '2025-08-12' });
    }
    // r === 3 → left unpaid (defaulters list)
  });

  // ---- Expenses ------------------------------------------------------------
  const expenses = [
    ['Salaries', 'Teaching Staff', 250000, brA, 'Payroll July'],
    ['Utilities', 'Electricity', 45000, brA, 'BESCOM bill'],
    ['Maintenance', 'Housekeeping', 18000, brB, 'Monthly contract'],
    ['Supplies', 'Stationery', 12000, brB, 'Office supplies'],
    ['Equipment', 'Lab Computers', 180000, brA, '10 desktops'],
    ['Marketing', 'Admissions Campaign', 60000, brB, 'Digital ads'],
    ['Rent', 'City Campus', 120000, brB, 'August rent'],
  ];
  expenses.forEach(([cat, sub, amt, branch, note], i) => {
    Expense.create({ category: cat, sub_category: sub, amount: amt, branch_id: branch,
      expense_date: '2025-08-0' + ((i % 8) + 1), paid_to: sub, payment_mode: 'netbanking', notes: note }, accId);
  });

  // ---- Exam forms ----------------------------------------------------------
  students.slice(0, 10).forEach((st, i) => {
    const type = ['regular', 'backlog', 'improvement'][i % 3];
    const status = ['submitted', 'approved', 'paid'][i % 3];
    ExamForm.create({
      student_id: st.id, exam_type: type, session: 'Dec 2025', semester: st.semester,
      subjects: type === 'backlog' ? 'Mathematics-II, Physics' : null,
      fee_amount: type === 'regular' ? 1500 : type === 'backlog' ? 800 : 1000,
      status, progress: ExamForm.progressFor(status), branch_id: st.branch_id,
    }, accId);
  });

  // ---- Discounts (workflow) ------------------------------------------------
  Discount.create({ student_id: students[3].id, fee_head: 'Tuition Fee', amount: 5000, reason: 'Merit scholarship', status: 'approved', branch_id: students[3].branch_id, requested_by: accId });
  Discount.create({ student_id: students[7].id, fee_head: 'Tuition Fee', amount: 3000, reason: 'Sibling discount', status: 'pending', branch_id: students[7].branch_id, requested_by: recA });

  // ---- Deadline reminder notifications -------------------------------------
  students.filter((s) => Fee.summary(s.id).due > 0).slice(0, 5).forEach((s) => {
    Notify.send({ channel: 'sms', recipient: Notify.normalizePhone(s.phone), recipientName: s.name,
      subject: 'Fee Due Reminder', message: `Dear ${s.name}, your semester fee is pending. Kindly pay before the due date to avoid late charges. - WSchools`,
      relatedType: 'student', relatedId: s.id, branchId: s.branch_id });
  });

  console.log('✓ Demo data seeded.');
  printSummary();
}

// --------------------------------------------------------------------------
function createUser(username, name, role, branchId, password) {
  const existing = db.get('SELECT id FROM users WHERE lower(username) = ?', [username.toLowerCase()]);
  if (existing) return existing.id;
  return Number(db.run(
    `INSERT INTO users (username, name, password_hash, role, branch_id, status) VALUES (?,?,?,?,?, 'active')`,
    [username.toLowerCase(), name, hashPassword(password), role, branchId]).lastInsertRowid);
}

function ensureSuperAdmin() {
  const existing = db.get('SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1', ['super_admin']);
  if (existing) return existing.id;
  const username = (config.admin.email || 'admin').split('@')[0] || 'admin';
  return Number(db.run(
    `INSERT INTO users (username, name, email, password_hash, role, branch_id, status, must_change_password)
     VALUES (?,?,?,?, 'super_admin', NULL, 'active', 0)`,
    [username.toLowerCase(), config.admin.name, config.admin.email.toLowerCase(), hashPassword(config.admin.password)]).lastInsertRowid);
}

function printSummary() {
  const counts = {};
  for (const t of ['branches', 'users', 'courses', 'fee_heads', 'fee_structures', 'students', 'student_fees',
    'receipts', 'receipt_items', 'expenses', 'exam_forms', 'discounts', 'sync_log', 'notifications']) {
    counts[t] = db.get(`SELECT COUNT(*) AS c FROM ${t}`).c;
  }
  console.log('  Rows:', JSON.stringify(counts));
  console.log('');
  console.log('  Login accounts (username / password):');
  console.log('  ┌───────────────┬──────────────┬───────────────────────┐');
  console.log('  │ Role          │ Username     │ Password              │');
  console.log('  ├───────────────┼──────────────┼───────────────────────┤');
  console.log(`  │ Super Admin   │ ${pad((config.admin.email || 'admin').split('@')[0], 12)} │ ${pad(config.admin.password, 21)} │`);
  console.log('  │ Branch Admin A│ admin_a      │ Admin@123             │');
  console.log('  │ Branch Admin B│ admin_b      │ Admin@123             │');
  console.log('  │ Accountant    │ accountant   │ Account@123           │');
  console.log('  │ Receptionist  │ reception    │ Reception@123         │');
  console.log('  │ Viewer        │ viewer       │ Viewer@123            │');
  console.log('  └───────────────┴──────────────┴───────────────────────┘');
}
function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

if (require.main === module) {
  try { seed(); }
  catch (err) { console.error('✗ Seed failed:', err); process.exit(1); }
}

module.exports = seed;
