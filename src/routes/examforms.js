'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/examFormController');

const view = requireArea('examforms');
const manage = requireManage('examforms');

router.get('/', view, C.list);
router.get('/new', manage, C.newForm);
router.post('/', manage, C.create);

router.get('/:id', view, C.show);
router.get('/:id/edit', manage, C.editForm);
router.post('/:id', manage, C.update);
router.post('/:id/status', manage, C.status);
router.post('/:id/delete', manage, C.remove);

module.exports = router;
