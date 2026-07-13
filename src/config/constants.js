'use strict';

/**
 * Domain constants used across the fee-management system.
 * Centralised so labels and options stay consistent everywhere.
 */

// The 6 payment modes from the brain chart.
const PAYMENT_MODES = [
  { value: 'cash',       label: 'Cash' },
  { value: 'card',       label: 'Card' },
  { value: 'upi',        label: 'UPI' },
  { value: 'netbanking', label: 'Net Banking' },
  { value: 'cheque',     label: 'Cheque' },
  { value: 'dd',         label: 'Demand Draft (DD)' },
];

// User roles (Super Admin, Branch Admin A/B via branch_id, Accountant,
// Receptionist, Viewer).
const ROLES = [
  { value: 'super_admin',  label: 'Super Admin' },
  { value: 'branch_admin', label: 'Branch Admin' },
  { value: 'accountant',   label: 'Accountant' },
  { value: 'receptionist', label: 'Receptionist' },
  { value: 'viewer',       label: 'Viewer' },
];

const EXAM_TYPES = [
  { value: 'regular',     label: 'Regular' },
  { value: 'backlog',     label: 'Backlog' },
  { value: 'improvement', label: 'Improvement' },
];

const FEE_STATUS = ['unpaid', 'partial', 'paid', 'waived'];

const STUDENT_STATUS = [
  { value: 'active',     label: 'Active' },
  { value: 'inactive',   label: 'Inactive' },
  { value: 'passed_out', label: 'Passed Out' },
];

const EXPENSE_CATEGORIES = [
  'Salaries', 'Utilities', 'Maintenance', 'Rent', 'Supplies',
  'Marketing', 'Events', 'Equipment', 'Travel', 'Miscellaneous',
];

// Default fee heads created on first run (the "7 heads").
const DEFAULT_FEE_HEADS = [
  'Tuition Fee', 'Admission Fee', 'Examination Fee', 'Library Fee',
  'Laboratory Fee', 'Development Fee', 'Miscellaneous Fee',
];

function labelFor(list, value) {
  const found = list.find((x) => x.value === value);
  return found ? found.label : value;
}

module.exports = {
  PAYMENT_MODES, ROLES, EXAM_TYPES, FEE_STATUS, STUDENT_STATUS,
  EXPENSE_CATEGORIES, DEFAULT_FEE_HEADS, labelFor,
};
