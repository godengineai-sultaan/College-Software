'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/userController');

const view = requireArea('users');
const manage = requireManage('users');

router.get('/', view, C.list);
router.get('/new', manage, C.newForm);
router.post('/', manage, C.create);
router.get('/:id/edit', manage, C.editForm);
router.post('/:id', manage, C.update);
router.get('/:id/password', manage, C.passwordForm);
router.post('/:id/password', manage, C.setPassword);
router.post('/:id/delete', manage, C.remove);

module.exports = router;
