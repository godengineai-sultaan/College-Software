'use strict';

/**
 * User account management (super-admin area). Create/edit staff logins,
 * assign roles + branches, and reset passwords. Password hashes are never
 * rendered — the model returns them but views only ever touch safe fields.
 */

const User = require('../models/user');
const Branch = require('../models/branch');
const Audit = require('../services/audit');
const { paginate, pageCount, clean } = require('../utils/helpers');
const { ROLES } = require('../config/constants');

// Roles that must be tied to a single branch. super_admin / viewer are all-branch.
const BRANCH_ROLES = ['branch_admin', 'accountant', 'receptionist'];

/** Resolve the branch id for a role: null for all-branch roles, else the picked one. */
function branchForRole(role, rawBranchId) {
  if (!BRANCH_ROLES.includes(role)) return null;
  const id = parseInt(rawBranchId, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

const UserController = {
  list(req, res) {
    const { page, perPage, offset } = paginate(req.query, 20);
    // The model has no filtered count, so fetch matches and page in memory
    // (user tables are small — this stays cheap).
    const all = User.all({
      role: clean(req.query.role) || undefined,
      branchId: parseInt(req.query.branch, 10) || undefined,
      search: clean(req.query.q) || undefined,
      limit: 9999, offset: 0,
    });
    const total = all.length;
    const users = all.slice(offset, offset + perPage);
    res.render('users/list', {
      title: 'User Accounts',
      users,
      total,
      page, pages: pageCount(total, perPage),
      baseQuery: req.query,
      roles: ROLES,
      branches: Branch.all(),
    });
  },

  newForm(req, res) {
    res.render('users/form', {
      title: 'Add User',
      account: {}, isEdit: false,
      roles: ROLES,
      branches: Branch.all(),
    });
  },

  create(req, res) {
    const username = (clean(req.body.username) || '').toLowerCase();
    const name = clean(req.body.name);
    const password = req.body.password;
    const role = clean(req.body.role) || 'viewer';
    if (!username || !name || !password) {
      req.flash('error', 'Username, name and password are required.');
      return res.redirect('/users/new');
    }
    if (User.findByUsername(username)) {
      req.flash('error', `Username "${username}" is already taken.`);
      return res.redirect('/users/new');
    }
    const branchId = branchForRole(role, req.body.branch_id);
    if (BRANCH_ROLES.includes(role) && !branchId) {
      req.flash('error', 'This role must be assigned to a branch.');
      return res.redirect('/users/new');
    }
    const id = User.create({
      username, name,
      email: clean(req.body.email),
      phone: clean(req.body.phone),
      password,
      role,
      branchId,
      mustChangePassword: !!req.body.must_change_password,
      status: clean(req.body.status) || 'active',
    });
    Audit.log(req, 'INSERT', 'users', id, null, { username, name, role, branch_id: branchId });
    req.flash('success', `User ${name} (@${username}) created.`);
    res.redirect('/users');
  },

  editForm(req, res) {
    const account = User.findById(req.params.id);
    if (!account) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    res.render('users/form', {
      title: 'Edit User',
      account, isEdit: true,
      roles: ROLES,
      branches: Branch.all(),
    });
  },

  update(req, res) {
    const account = User.findById(req.params.id);
    if (!account) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    const username = (clean(req.body.username) || '').toLowerCase();
    const name = clean(req.body.name);
    const role = clean(req.body.role) || account.role;
    if (!username || !name) {
      req.flash('error', 'Username and name are required.');
      return res.redirect(`/users/${account.id}/edit`);
    }
    const clash = User.findByUsername(username);
    if (clash && clash.id !== account.id) {
      req.flash('error', `Username "${username}" is already taken.`);
      return res.redirect(`/users/${account.id}/edit`);
    }
    const branchId = branchForRole(role, req.body.branch_id);
    if (BRANCH_ROLES.includes(role) && !branchId) {
      req.flash('error', 'This role must be assigned to a branch.');
      return res.redirect(`/users/${account.id}/edit`);
    }
    // Safety: don't let admins deactivate their own account and lock themselves out.
    let status = clean(req.body.status) || 'active';
    if (account.id === req.user.id && status !== 'active') {
      status = 'active';
      req.flash('info', 'You cannot deactivate your own account — status kept active.');
    }
    User.update(account.id, {
      username, name,
      email: clean(req.body.email),
      phone: clean(req.body.phone),
      role,
      branch_id: branchId,
      status,
    });
    Audit.log(req, 'UPDATE', 'users', account.id,
      { username: account.username, role: account.role, status: account.status },
      { username, role, status });
    req.flash('success', 'User updated.');
    res.redirect('/users');
  },

  // ---- Password reset (separate flow so hashes never touch the edit form) ----
  passwordForm(req, res) {
    const account = User.findById(req.params.id);
    if (!account) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    res.render('users/form', { title: 'Reset Password', account, isPassword: true });
  },

  setPassword(req, res) {
    const account = User.findById(req.params.id);
    if (!account) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    const pass = req.body.new_password;
    if (!pass || String(pass).length < 6) {
      req.flash('error', 'Password must be at least 6 characters.');
      return res.redirect(`/users/${account.id}/password`);
    }
    if (String(pass) !== String(req.body.confirm_password)) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect(`/users/${account.id}/password`);
    }
    User.setPassword(account.id, pass);
    // setPassword clears must_change_password; re-apply if the admin asked for it.
    if (req.body.must_change_password) User.update(account.id, { must_change_password: 1 });
    Audit.log(req, 'UPDATE', 'users', account.id, null, { password_reset: true });
    req.flash('success', `Password reset for ${account.name}.`);
    res.redirect('/users');
  },

  remove(req, res) {
    const account = User.findById(req.params.id);
    if (!account) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    if (account.id === req.user.id) {
      req.flash('error', 'You cannot delete your own account.');
      return res.redirect('/users');
    }
    User.remove(account.id);
    Audit.log(req, 'DELETE', 'users', account.id, { username: account.username, role: account.role }, null);
    req.flash('success', `User @${account.username} deleted.`);
    res.redirect('/users');
  },
};

module.exports = UserController;
