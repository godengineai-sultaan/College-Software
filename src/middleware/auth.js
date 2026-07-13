'use strict';

/**
 * Authentication & authorization middleware.
 */

const User = require('../models/user');
const { roleCan, roleCanManage, isBranchScoped } = require('../config/permissions');

/**
 * Populates req.user and view helpers: can(area), canManage(area), and the
 * branch scope (branchScopeId = the branch this user is limited to, or null
 * for all-branch roles like super_admin / viewer).
 */
function loadUser(req, res, next) {
  const uid = req.session && req.session.userId;
  if (uid) {
    const user = User.findById(uid);
    if (user && user.status === 'active') {
      req.user = user;
      req.branchScopeId = isBranchScoped(user.role) ? user.branch_id : null;
      res.locals.currentUser = user;
    } else {
      req.session.destroy(() => {});
    }
  }
  res.locals.can = (area) => (req.user ? roleCan(req.user.role, area) : false);
  res.locals.canManage = (area) => (req.user ? roleCanManage(req.user.role, area) : false);
  res.locals.branchScopeId = req.branchScopeId || null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    req.flash('error', 'Please sign in to continue.');
    return res.redirect('/login');
  }
  if (req.user.must_change_password && !req.path.startsWith('/profile/password') && req.method === 'GET') {
    req.flash('info', 'For security, please set a new password before continuing.');
    return res.redirect('/profile/password');
  }
  next();
}

/** Require at least VIEW access to an area. */
function requireArea(area) {
  return function (req, res, next) {
    if (!req.user) return res.redirect('/login');
    if (!roleCan(req.user.role, area)) {
      return res.status(403).render('errors/403', { title: 'Access denied', layout: 'layouts/auth' });
    }
    next();
  };
}

/** Require MANAGE (create/edit/delete) access to an area. */
function requireManage(area) {
  return function (req, res, next) {
    if (!req.user) return res.redirect('/login');
    if (!roleCanManage(req.user.role, area)) {
      return res.status(403).render('errors/403', {
        title: 'Access denied', layout: 'layouts/auth',
        message: 'Your role can view this section but not make changes.',
      });
    }
    next();
  };
}

function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.user) return res.redirect('/login');
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('errors/403', { title: 'Access denied', layout: 'layouts/auth' });
    }
    next();
  };
}

module.exports = { loadUser, requireAuth, requireArea, requireManage, requireRole };
