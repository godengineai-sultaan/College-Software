'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/branchController');

const view = requireArea('branches');
const manage = requireManage('branches');

router.get('/', view, C.list);
router.get('/new', manage, C.newForm);
router.post('/', manage, C.create);
router.get('/:id/edit', manage, C.editForm);
router.post('/:id', manage, C.update);
router.post('/:id/delete', manage, C.remove);

module.exports = router;
