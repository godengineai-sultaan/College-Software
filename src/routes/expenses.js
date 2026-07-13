'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const { verify } = require('../middleware/csrf');
const { fileUpload } = require('../utils/upload');
const C = require('../controllers/expenseController');

const view = requireArea('expenses');
const manage = requireManage('expenses');

router.get('/', view, C.list);
router.get('/new', manage, C.newForm);
router.post('/', manage, fileUpload.single('bill'), verify, C.create);

router.get('/:id/edit', manage, C.editForm);
router.post('/:id', manage, fileUpload.single('bill'), verify, C.update);
router.post('/:id/delete', manage, C.remove);

module.exports = router;
