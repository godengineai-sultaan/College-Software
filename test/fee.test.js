'use strict';

require('./_db'); // MUST be first — points the DB at a temp file
const { test } = require('node:test');
const assert = require('node:assert/strict');

const Setting = require('../src/models/setting');
const IdGen = require('../src/services/idgen');
const Fee = require('../src/services/fee');
const Collection = require('../src/services/collection');
const Student = require('../src/models/student');
const Branch = require('../src/models/branch');
const Course = require('../src/models/course');

const yy = String(new Date().getFullYear()).slice(-2);

test('IdGen — formats and sequential per branch/year', () => {
  const a1 = IdGen.student('A');
  const a2 = IdGen.student('A');
  assert.match(a1, new RegExp(`^COL-A-${yy}-\\d{4}$`));
  assert.equal(Number(a2.slice(-4)), Number(a1.slice(-4)) + 1);

  assert.match(IdGen.receipt('B'), new RegExp(`^REC-B-${yy}-\\d{6}$`));
  assert.match(IdGen.voucher('A'), new RegExp(`^VCH-A-${yy}-\\d{4}$`));
  assert.match(IdGen.examForm('A'), new RegExp(`^EXF-A-${yy}-\\d{4}$`));
});

test('fee ledger — assign structure and compute summary (no late fee)', () => {
  Setting.set('late_fee_enabled', '0'); // deterministic amounts
  const branchA = Branch.findByCode('A');
  const bcom = Course.findByCode('BCOM');
  const { id } = Student.create({ name: 'Test One', branch_id: branchA.id, course_id: bcom.id, semester: 1 }, null);
  const student = Student.findById(id);

  const created = Fee.assignStructureToStudent(student);
  assert.ok(created >= 5, 'assigns the BCom Sem-1 heads');

  const summary = Fee.summary(id);
  // BCom Sem 1 heads: 25000 + 5000 + 2000 + 1500 + 3000 = 36500
  assert.equal(summary.net, 36500);
  assert.equal(summary.paid, 0);
  assert.equal(summary.due, 36500);
});

test('fee allocation — spreads a payment across heads, never over-allocates', () => {
  Setting.set('late_fee_enabled', '0');
  const branchA = Branch.findByCode('A');
  const bcom = Course.findByCode('BCOM');
  const { id } = Student.create({ name: 'Test Two', branch_id: branchA.id, course_id: bcom.id, semester: 1 }, null);
  Fee.assignStructureToStudent(Student.findById(id));

  const { allocation, unallocated } = Fee.allocate(id, 8000);
  const total = allocation.reduce((s, a) => s + a.amount, 0);
  assert.equal(Math.round(total * 100) / 100, 8000);
  assert.equal(unallocated, 0);

  // Allocating more than due leaves the remainder unallocated.
  const big = Fee.allocate(id, 999999);
  const allocated = big.allocation.reduce((s, a) => s + a.amount, 0);
  assert.equal(allocated, 36500);
  assert.ok(big.unallocated > 0);
});

test('collection — records receipt, updates ledger, rejects over-payment', () => {
  Setting.set('late_fee_enabled', '0');
  const branchA = Branch.findByCode('A');
  const bcom = Course.findByCode('BCOM');
  const { id } = Student.create({ name: 'Test Three', branch_id: branchA.id, course_id: bcom.id, semester: 1 }, null);
  Fee.assignStructureToStudent(Student.findById(id));

  const before = Fee.summary(id).due;
  const res = Collection.collect({ req: null, studentId: id, payAmount: 10000, mode: 'cash', collectingBranchId: branchA.id });
  assert.match(res.receiptNo, new RegExp(`^REC-A-${yy}-\\d{6}$`));
  assert.equal(res.crossBranch, false);

  const after = Fee.summary(id).due;
  assert.equal(Math.round((before - after) * 100) / 100, 10000);

  assert.throws(() => Collection.collect({ req: null, studentId: id, payAmount: 10_000_000, mode: 'cash', collectingBranchId: branchA.id }), /exceeds/i);
  assert.throws(() => Collection.collect({ req: null, studentId: id, payAmount: 0, mode: 'cash', collectingBranchId: branchA.id }), /greater than zero/i);
});

test('collection — cross-branch payment is flagged and mirrored', () => {
  Setting.set('late_fee_enabled', '0');
  const branchA = Branch.findByCode('A');
  const branchB = Branch.findByCode('B');
  const bcom = Course.findByCode('BCOM');
  const { id } = Student.create({ name: 'Test Cross', branch_id: branchB.id, course_id: bcom.id, semester: 1 }, null);
  Fee.assignStructureToStudent(Student.findById(id));

  const res = Collection.collect({ req: null, studentId: id, payAmount: 5000, mode: 'cash', collectingBranchId: branchA.id });
  assert.equal(res.crossBranch, true);
  assert.match(res.receiptNo, /^REC-A-/); // collected at branch A

  const db = require('../src/db/connection');
  const sync = db.get('SELECT * FROM sync_log ORDER BY id DESC LIMIT 1');
  assert.ok(sync, 'a sync record was written');
  assert.equal(sync.status, 'committed');
  assert.equal(sync.source_branch, 'A');
  assert.equal(sync.target_branch, 'B');
});

test('late fee — applies for overdue lines when enabled', () => {
  Setting.set('late_fee_enabled', '1');
  Setting.set('late_fee_per_day', '10');
  Setting.set('late_fee_max', '2000');
  const branchA = Branch.findByCode('A');
  const bcom = Course.findByCode('BCOM');
  const { id } = Student.create({ name: 'Test Late', branch_id: branchA.id, course_id: bcom.id, semester: 1 }, null);
  Fee.assignStructureToStudent(Student.findById(id));
  const summary = Fee.summary(id);
  // Seeded structures have due_date 2025-08-15 (past), so late fees accrue.
  assert.ok(summary.late_fee > 0, 'late fee accrues on overdue lines');
  assert.ok(summary.net > 36500, 'net exceeds base due by late fees');
});
