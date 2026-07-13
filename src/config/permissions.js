'use strict';

/**
 * Role-based access control for the 6 user roles, plus branch scoping.
 *
 * Each "area" maps to a section of the app (usually a route prefix).
 * Two capability levels are supported per area: 'view' and 'manage'.
 * Edit the maps below to change who can do what — nothing else changes.
 *
 * Branch scoping (see canSeeBranch / scopeBranch) restricts branch-scoped
 * roles (branch_admin, accountant, receptionist) to their own branch, while
 * super_admin and viewer can see all branches.
 */

const AREAS = [
  'dashboard', 'students', 'fees', 'collection', 'receipts', 'structures',
  'expenses', 'examforms', 'reports', 'exports', 'notifications',
  'branches', 'courses', 'users', 'settings', 'audit', 'backup', 'profile',
];

// area -> { view: [roles], manage: [roles] }.  super_admin implicitly can do all.
const MATRIX = {
  dashboard:     { view: ['*'],                                            manage: [] },
  students:      { view: ['branch_admin','accountant','receptionist','viewer'], manage: ['branch_admin','receptionist'] },
  fees:          { view: ['branch_admin','accountant','receptionist','viewer'], manage: ['branch_admin','accountant'] },
  collection:    { view: ['branch_admin','accountant','receptionist'],     manage: ['branch_admin','accountant','receptionist'] },
  receipts:      { view: ['branch_admin','accountant','receptionist','viewer'], manage: ['branch_admin','accountant'] },
  structures:    { view: ['branch_admin','accountant','viewer'],           manage: ['branch_admin','accountant'] },
  expenses:      { view: ['branch_admin','accountant','viewer'],           manage: ['branch_admin','accountant'] },
  examforms:     { view: ['branch_admin','accountant','receptionist','viewer'], manage: ['branch_admin','receptionist'] },
  reports:       { view: ['branch_admin','accountant','viewer'],           manage: [] },
  exports:       { view: ['branch_admin','accountant','viewer'],           manage: ['branch_admin','accountant'] },
  notifications: { view: ['branch_admin','accountant','receptionist','viewer'], manage: ['branch_admin'] },
  branches:      { view: ['viewer'],                                       manage: [] },  // super_admin only to manage
  courses:       { view: ['branch_admin','accountant','viewer'],           manage: ['branch_admin'] },
  users:         { view: [],                                               manage: [] },  // super_admin only
  settings:      { view: [],                                               manage: [] },  // super_admin only
  audit:         { view: ['branch_admin'],                                 manage: [] },  // + super_admin
  backup:        { view: [],                                               manage: [] },  // super_admin only
  profile:       { view: ['*'],                                            manage: ['*'] },
};

function inList(list, role) {
  return list.includes('*') || list.includes(role);
}

/** Can this role at least VIEW the area? */
function roleCan(role, area) {
  if (role === 'super_admin') return true;
  const m = MATRIX[area];
  if (!m) return false;
  return inList(m.view, role) || inList(m.manage, role);
}

/** Can this role MANAGE (create/edit/delete) within the area? */
function roleCanManage(role, area) {
  if (role === 'super_admin') return true;
  const m = MATRIX[area];
  if (!m) return false;
  return inList(m.manage, role);
}

/** Roles restricted to a single branch. super_admin & viewer see all branches. */
function isBranchScoped(role) {
  return ['branch_admin', 'accountant', 'receptionist'].includes(role);
}

module.exports = { AREAS, MATRIX, roleCan, roleCanManage, isBranchScoped };
