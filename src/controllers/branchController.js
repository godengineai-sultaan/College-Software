'use strict';

/**
 * Branch management (super-admin area). Branches are the top-level tenancy
 * boundary — students, users, fees and receipts all hang off a branch, so
 * deleting one cascades. Kept intentionally small: list + CRUD.
 */

const Branch = require('../models/branch');
const Student = require('../models/student');
const User = require('../models/user');
const Audit = require('../services/audit');
const { clean } = require('../utils/helpers');

const BranchController = {
  list(req, res) {
    const branches = Branch.all();
    const active = branches.filter((b) => b.is_active).length;
    // Enrich each row with the counts that make a delete dangerous.
    branches.forEach((b) => {
      b.student_count = Student.count({ branchId: b.id });
      b.user_count = User.all({ branchId: b.id, limit: 9999 }).length;
    });
    res.render('branches/list', {
      title: 'Branches',
      branches,
      counts: { total: branches.length, active, inactive: branches.length - active },
    });
  },

  newForm(req, res) {
    res.render('branches/form', { title: 'Add Branch', branch: {}, isEdit: false });
  },

  create(req, res) {
    const data = collect(req.body);
    if (!data.branch_code || !data.name) {
      req.flash('error', 'Branch code and name are required.');
      return res.redirect('/branches/new');
    }
    if (Branch.findByCode(data.branch_code)) {
      req.flash('error', `Branch code "${data.branch_code}" already exists.`);
      return res.redirect('/branches/new');
    }
    const id = Branch.create(data);
    Audit.log(req, 'INSERT', 'branches', id, null, { branch_code: data.branch_code, name: data.name });
    req.flash('success', `Branch ${data.branch_code} — ${data.name} created.`);
    res.redirect('/branches');
  },

  editForm(req, res) {
    const branch = Branch.findById(req.params.id);
    if (!branch) { req.flash('error', 'Branch not found.'); return res.redirect('/branches'); }
    res.render('branches/form', { title: 'Edit Branch', branch, isEdit: true });
  },

  update(req, res) {
    const branch = Branch.findById(req.params.id);
    if (!branch) { req.flash('error', 'Branch not found.'); return res.redirect('/branches'); }
    const data = collect(req.body);
    if (!data.branch_code || !data.name) {
      req.flash('error', 'Branch code and name are required.');
      return res.redirect(`/branches/${branch.id}/edit`);
    }
    // Don't let two branches share a code.
    const clash = Branch.findByCode(data.branch_code);
    if (clash && clash.id !== branch.id) {
      req.flash('error', `Branch code "${data.branch_code}" is already used by another branch.`);
      return res.redirect(`/branches/${branch.id}/edit`);
    }
    Branch.update(branch.id, data);
    Audit.log(req, 'UPDATE', 'branches', branch.id,
      { branch_code: branch.branch_code, name: branch.name, is_active: branch.is_active },
      { branch_code: data.branch_code, name: data.name, is_active: data.is_active });
    req.flash('success', 'Branch updated.');
    res.redirect('/branches');
  },

  remove(req, res) {
    const branch = Branch.findById(req.params.id);
    if (!branch) { req.flash('error', 'Branch not found.'); return res.redirect('/branches'); }
    try {
      Branch.remove(branch.id);
      Audit.log(req, 'DELETE', 'branches', branch.id, { branch_code: branch.branch_code, name: branch.name }, null);
      req.flash('success', `Branch ${branch.branch_code} deleted.`);
    } catch (e) {
      // Foreign-key constraints (students/users/records still attached) land here.
      req.flash('error', 'Could not delete this branch — records are still attached to it.');
    }
    res.redirect('/branches');
  },
};

/** Map a posted form into the shape Branch.create/update expects. */
function collect(body) {
  return {
    branch_code: (clean(body.branch_code) || '').toUpperCase(),
    name: clean(body.name),
    address: clean(body.address),
    phone: clean(body.phone),
    email: clean(body.email),
    is_active: body.is_active ? 1 : 0,
  };
}

module.exports = BranchController;
