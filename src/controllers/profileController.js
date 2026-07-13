'use strict';

const User = require('../models/user');
const Audit = require('../services/audit');
const { verifyPassword } = require('../utils/helpers');

const ProfileController = {
  show(req, res) {
    res.render('profile/show', { title: 'My Profile' });
  },

  showPassword(req, res) {
    res.render('profile/password', { title: 'Change Password' });
  },

  updateProfile(req, res) {
    const { name, email, phone } = req.body;
    User.update(req.user.id, { name, email, phone });
    Audit.log(req, 'UPDATE', 'users', req.user.id, null, { name, email, phone });
    req.flash('success', 'Profile updated.');
    res.redirect('/profile');
  },

  updatePassword(req, res) {
    const { current_password, new_password, confirm_password } = req.body;
    if (!verifyPassword(current_password, req.user.password_hash)) {
      req.flash('error', 'Your current password is incorrect.');
      return res.redirect('/profile/password');
    }
    if (!new_password || new_password.length < 6) {
      req.flash('error', 'New password must be at least 6 characters.');
      return res.redirect('/profile/password');
    }
    if (new_password !== confirm_password) {
      req.flash('error', 'New password and confirmation do not match.');
      return res.redirect('/profile/password');
    }
    User.setPassword(req.user.id, new_password);
    Audit.log(req, 'UPDATE', 'users', req.user.id, null, { action: 'password_change' });
    req.flash('success', 'Password changed successfully.');
    res.redirect('/profile');
  },
};

module.exports = ProfileController;
