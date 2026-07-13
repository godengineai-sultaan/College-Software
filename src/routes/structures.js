'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/structureController');

const view = requireArea('structures');
const manage = requireManage('structures');

router.get('/', view, C.list);
router.get('/group', view, C.group);
router.get('/new', manage, C.newForm);
router.post('/', manage, C.create);
router.get('/:id/edit', manage, C.editForm);
router.post('/:id', manage, C.update);
router.post('/:id/delete', manage, C.destroy);

module.exports = router;
