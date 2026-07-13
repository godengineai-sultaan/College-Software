'use strict';

const Expense = require('../models/expense');
const Branch = require('../models/branch');
const Stats = require('../services/stats');
const Audit = require('../services/audit');
const { paginate, pageCount, clean } = require('../utils/helpers');
const { EXPENSE_CATEGORIES, PAYMENT_MODES } = require('../config/constants');

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

const ExpenseController = {
  list(req, res) {
    const { page, perPage, offset } = paginate(req.query, 20);
    const branchId = scope(req);
    const filter = {
      branchId,
      category: clean(req.query.category) || undefined,
      from: clean(req.query.from) || undefined,
      to: clean(req.query.to) || undefined,
      search: clean(req.query.q) || undefined,
      limit: perPage, offset,
    };
    const rows = Expense.all(filter);
    const total = Expense.count(filter);
    // KPI tiles: total spend for the current filter, plus the net collection
    // (collections − expenses) across the whole branch scope.
    const totalExpense = Expense.sum(filter);
    const collectionsTotal = Stats.collections({ branchId }).total;
    const expensesTotal = Stats.expenses({ branchId }).total;
    res.render('expenses/list', {
      title: 'Expenses',
      expenses: rows, total,
      totalExpense,
      collectionsTotal,
      netCollection: collectionsTotal - expensesTotal,
      page, pages: pageCount(total, perPage),
      baseQuery: req.query,
      branches: pickableBranches(req),
      categories: EXPENSE_CATEGORIES,
    });
  },

  newForm(req, res) {
    res.render('expenses/form', {
      title: 'Add Expense',
      expense: {}, isEdit: false,
      branches: pickableBranches(req),
      categories: EXPENSE_CATEGORIES,
      modes: PAYMENT_MODES,
    });
  },

  create(req, res) {
    const data = collect(req.body);
    data.branch_id = req.branchScopeId || parseInt(req.body.branch_id, 10);
    if (req.file) data.bill_attachment = req.file.filename;   // stored under public/uploads
    if (!data.branch_id) {
      req.flash('error', 'Please choose a branch for this expense.');
      return res.redirect('/expenses/new');
    }
    if (!data.amount) {
      req.flash('error', 'Please enter a valid amount.');
      return res.redirect('/expenses/new');
    }
    const { id, voucher_no } = Expense.create(data, req.user.id);
    Audit.log(req, 'INSERT', 'expenses', id, null, { voucher_no, amount: data.amount, category: data.category });
    req.flash('success', `Expense ${voucher_no} recorded.`);
    res.redirect('/expenses');
  },

  editForm(req, res) {
    const expense = Expense.findById(req.params.id);
    if (!expense) { req.flash('error', 'Expense not found.'); return res.redirect('/expenses'); }
    if (req.branchScopeId && expense.branch_id !== req.branchScopeId) {
      return res.status(403).render('errors/403', { title: 'Access denied', layout: 'layouts/auth' });
    }
    res.render('expenses/form', {
      title: 'Edit Expense',
      expense, isEdit: true,
      branches: pickableBranches(req),
      categories: EXPENSE_CATEGORIES,
      modes: PAYMENT_MODES,
    });
  },

  update(req, res) {
    const expense = Expense.findById(req.params.id);
    if (!expense) { req.flash('error', 'Expense not found.'); return res.redirect('/expenses'); }
    if (req.branchScopeId && expense.branch_id !== req.branchScopeId) {
      return res.status(403).render('errors/403', { title: 'Access denied', layout: 'layouts/auth' });
    }
    const data = collect(req.body);
    if (req.file) data.bill_attachment = req.file.filename;   // only replace if a new file was uploaded
    Expense.update(expense.id, data);
    Audit.log(req, 'UPDATE', 'expenses', expense.id, { amount: expense.amount }, { amount: data.amount });
    req.flash('success', `Expense ${expense.voucher_no} updated.`);
    res.redirect('/expenses');
  },

  remove(req, res) {
    const expense = Expense.findById(req.params.id);
    if (expense) {
      if (req.branchScopeId && expense.branch_id !== req.branchScopeId) {
        return res.status(403).render('errors/403', { title: 'Access denied', layout: 'layouts/auth' });
      }
      Expense.remove(expense.id);
      Audit.log(req, 'DELETE', 'expenses', expense.id, { voucher_no: expense.voucher_no }, null);
      req.flash('success', `Expense ${expense.voucher_no} deleted.`);
    }
    res.redirect('/expenses');
  },
};

function collect(body) {
  return {
    category: clean(body.category),
    sub_category: clean(body.sub_category),
    amount: parseFloat(body.amount) || 0,
    expense_date: clean(body.expense_date),
    paid_to: clean(body.paid_to),
    payment_mode: clean(body.payment_mode) || 'cash',
    notes: clean(body.notes),
  };
}

module.exports = ExpenseController;
