'use strict';

const Receipt = require('../models/receipt');
const Branch = require('../models/branch');
const Collection = require('../services/collection');
const { paginate, pageCount, clean } = require('../utils/helpers');
const { PAYMENT_MODES } = require('../config/constants');

function scope(req) {
  if (req.branchScopeId) return req.branchScopeId;
  const b = parseInt(req.query.branch, 10);
  return Number.isFinite(b) && b > 0 ? b : null;
}

const ReceiptController = {
  list(req, res) {
    const { page, perPage, offset } = paginate(req.query, 20);
    const filter = {
      branchId: scope(req),
      mode: clean(req.query.mode) || undefined,
      crossBranch: req.query.cross === '1' ? true : (req.query.cross === '0' ? false : undefined),
      from: clean(req.query.from) || undefined,
      to: clean(req.query.to) || undefined,
      search: clean(req.query.q) || undefined,
      limit: perPage, offset,
    };
    const rows = Receipt.all(filter);
    const total = Receipt.count(filter);
    const totalAmount = Receipt.sum(filter);
    res.render('receipts/list', {
      title: 'Receipts',
      receipts: rows, total, totalAmount,
      page, pages: pageCount(total, perPage),
      baseQuery: req.query,
      branches: req.branchScopeId ? [] : Branch.all({ activeOnly: true }),
      modes: PAYMENT_MODES,
    });
  },

  show(req, res) {
    const receipt = Receipt.findById(req.params.id);
    if (!receipt) { req.flash('error', 'Receipt not found.'); return res.redirect('/receipts'); }
    if (req.branchScopeId && receipt.branch_id !== req.branchScopeId && receipt.student_branch_id !== req.branchScopeId) {
      return res.status(403).render('errors/403', { title: 'Access denied', layout: 'layouts/auth' });
    }
    res.render('receipts/show', {
      title: `Receipt ${receipt.receipt_no}`,
      receipt,
      items: Receipt.items(receipt.id),
      isNew: req.query.new === '1',
    });
  },

  print(req, res) {
    const receipt = Receipt.findById(req.params.id);
    if (!receipt) { req.flash('error', 'Receipt not found.'); return res.redirect('/receipts'); }
    res.render('receipts/print', {
      title: `Receipt ${receipt.receipt_no}`,
      layout: false,
      receipt,
      items: Receipt.items(receipt.id),
      settings: res.locals.settings,
      currency: res.locals.currency,
      h: res.locals.h,
      labelFor: res.locals.labelFor,
      constants: res.locals.constants,
    });
  },

  cancel(req, res) {
    try {
      const r = Collection.cancel({ req, receiptId: req.params.id });
      req.flash('success', `Receipt ${r.receipt_no} cancelled and dues restored.`);
    } catch (err) {
      req.flash('error', err.message || 'Could not cancel receipt.');
    }
    res.redirect(`/receipts/${req.params.id}`);
  },
};

module.exports = ReceiptController;
