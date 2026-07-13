'use strict';

/**
 * M4: Fee collection — the core money transaction.
 *
 * Flow (mirrors the brain-chart data flow #2):
 *   search student → fetch dues → head-wise allocation → record payment
 *   → generate receipt → (if cross-branch) two-phase sync → SMS → audit.
 *
 * The whole write is wrapped in a DB transaction so the receipt counter, the
 * receipt, its items and the ledger updates all commit together or not at all.
 */

const db = require('../db/connection');
const IdGen = require('./idgen');
const Fee = require('./fee');
const Sync = require('./sync');
const Notify = require('./notify');
const Audit = require('./audit');
const Student = require('../models/student');
const StudentFee = require('../models/studentFee');
const Receipt = require('../models/receipt');
const Branch = require('../models/branch');

const Collection = {
  /**
   * @returns { receiptId, receiptNo, crossBranch, allocation, remainingDue }
   */
  collect({ req, studentId, payAmount, mode = 'cash', referenceNo, remarks, paidOn, collectingBranchId, collectedBy }) {
    const student = Student.findById(studentId);
    if (!student) throw httpError(404, 'Student not found');

    const amount = Math.round((Number(payAmount) || 0) * 100) / 100;
    if (amount <= 0) throw httpError(400, 'Payment amount must be greater than zero.');

    const summaryBefore = Fee.summary(studentId);
    if (amount > summaryBefore.due + 0.01) {
      throw httpError(400, `Amount exceeds the total due of ${summaryBefore.due.toFixed(2)}.`);
    }

    const collectBranchId = collectingBranchId || student.branch_id;
    const collectBranch = Branch.findById(collectBranchId);
    const collectCode = collectBranch ? collectBranch.branch_code : 'A';
    const crossBranch = Number(student.branch_id) !== Number(collectBranchId);

    const { allocation } = Fee.allocate(studentId, amount);

    const result = db.tx(() => {
      const receiptNo = IdGen.receipt(collectCode);
      const lateTotal = allocation.reduce((s, a) => s + (Number(a.late_fee) || 0), 0);

      const rec = db.run(
        `INSERT INTO receipts
           (receipt_no, student_id, student_branch_id, amount, discount_total, late_fee_total,
            payment_mode, reference_no, branch_id, cross_branch, remarks, paid_on, collected_by, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'active')`,
        [receiptNo, studentId, student.branch_id, amount, 0, lateTotal, mode, referenceNo || null,
         collectBranchId, crossBranch ? 1 : 0, remarks || null, paidOn || todayStr(),
         collectedBy || (req && req.user ? req.user.id : null)]);
      const receiptId = Number(rec.lastInsertRowid);

      for (const a of allocation) {
        db.run(
          `INSERT INTO receipt_items (receipt_id, sf_id, fee_head, amount, discount, late_fee) VALUES (?,?,?,?,?,?)`,
          [receiptId, a.sf_id, a.fee_head, a.amount, 0, a.late_fee || 0]);
        StudentFee.recordCollection(a.sf_id, { pay: a.amount, lateFee: a.late_fee });
      }

      // Cross-branch two-phase mirror.
      if (crossBranch) {
        const s = Sync.prepare({
          entity: 'receipt', recordId: receiptId,
          sourceBranch: collectCode, targetBranch: student.branch_code,
          payload: { receiptNo, amount, studentUid: student.unique_id },
        });
        Sync.commit(s.id);
      }

      Audit.log(req, 'INSERT', 'receipts', receiptId, null,
        { receipt_no: receiptNo, amount, mode, cross_branch: crossBranch });

      return { receiptId, receiptNo };
    });

    // Post-commit: notify (its own write; must not roll back the receipt).
    const fullReceipt = Receipt.findById(result.receiptId);
    Notify.paymentConfirmation(student, fullReceipt);

    const summaryAfter = Fee.summary(studentId);
    return {
      receiptId: result.receiptId,
      receiptNo: result.receiptNo,
      crossBranch,
      allocation,
      remainingDue: summaryAfter.due,
    };
  },
};

/**
 * Cancel a receipt: reverse each item from the student ledger and mark the
 * receipt cancelled. Wrapped in a transaction for consistency.
 */
Collection.cancel = function ({ req, receiptId }) {
  const receipt = Receipt.findById(receiptId);
  if (!receipt) throw httpError(404, 'Receipt not found');
  if (receipt.status === 'cancelled') return receipt;
  const items = Receipt.items(receiptId);
  db.tx(() => {
    for (const it of items) {
      if (!it.sf_id) continue;
      const line = StudentFee.findById(it.sf_id);
      if (!line) continue;
      const paid = Math.max(0, Number(line.paid_amount) - Number(it.amount));
      const net = Number(line.amount) - Number(line.discount) + Number(line.late_fee);
      let status = 'unpaid';
      if (net <= 0) status = 'waived';
      else if (paid >= net - 0.001) status = 'paid';
      else if (paid > 0) status = 'partial';
      db.run(`UPDATE student_fees SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
        [paid, status, it.sf_id]);
    }
    Receipt.cancel(receiptId);
    Audit.log(req, 'CANCEL', 'receipts', receiptId, { receipt_no: receipt.receipt_no }, { cancelled: true });
  });
  return Receipt.findById(receiptId);
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

module.exports = Collection;
