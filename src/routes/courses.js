'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const C = require('../controllers/courseController');

const view = requireArea('courses');
const manage = requireManage('courses');

router.get('/', view, C.index);
router.get('/new', manage, C.newForm);
router.post('/', manage, C.create);

// Fee heads — declared before the /:id routes so "heads" is not read as an id.
router.post('/heads', manage, C.createHead);
router.post('/heads/:id/delete', manage, C.destroyHead);

router.get('/:id/edit', manage, C.editForm);
router.post('/:id', manage, C.update);
router.post('/:id/delete', manage, C.destroy);

module.exports = router;
