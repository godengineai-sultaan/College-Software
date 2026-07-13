'use strict';

const User = require('../models/user');
const Audit = require('../services/audit');
const { verifyPassword } = require('../utils/helpers');

// Simple in-memory login throttling (per username+ip): 5 tries → 15-min lock.
const attempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

function key(req, username) {
  return `${(req.ip || 'x')}:${String(username || '').toLowerCase()}`;
}
function isLocked(k) {
  const a = attempts.get(k);
  return a && a.count >= MAX_ATTEMPTS && Date.now() - a.first < LOCK_MS;
}
function recordFail(k) {
  const a = attempts.get(k) || { count: 0, first: Date.now() };
  if (Date.now() - a.first > LOCK_MS) { a.count = 0; a.first = Date.now(); }
  a.count += 1;
  attempts.set(k, a);
}

const AuthController = {
  showLogin(req, res) {
    if (req.user) return res.redirect('/dashboard');
    res.render('auth/login', { title: 'Sign in', layout: 'layouts/auth', error: null });
  },

  login(req, res) {
    const { username, password } = req.body;
    const k = key(req, username);
    if (isLocked(k)) {
      return res.status(429).render('auth/login', {
        title: 'Sign in', layout: 'layouts/auth',
        error: 'Too many failed attempts. Please try again in 15 minutes.',
      });
    }

    const user = User.findByUsername(username);
    if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) {
      recordFail(k);
      return res.status(401).render('auth/login', {
        title: 'Sign in', layout: 'layouts/auth',
        error: 'Invalid username or password.',
      });
    }

    attempts.delete(k);
    User.recordLogin(user.id);
    req.session.userId = user.id;
    req.user = user;
    Audit.log(req, 'LOGIN', 'users', user.id, null, { username: user.username });

    const dest = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    req.flash('success', `Welcome back, ${user.name.split(' ')[0]}!`);
    res.redirect(dest);
  },

  logout(req, res) {
    if (req.user) Audit.log(req, 'LOGOUT', 'users', req.user.id, null, null);
    req.session.destroy(() => res.redirect('/login'));
  },
};

module.exports = AuthController;
