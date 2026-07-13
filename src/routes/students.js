'use strict';

const express = require('express');
const router = express.Router();
const { requireArea, requireManage } = require('../middleware/auth');
const { verify } = require('../middleware/csrf');
const { upload, csvUpload } = require('../utils/upload');
const C = require('../controllers/studentController');

const view = requireArea('students');
const manage = requireManage('students');

router.get('/', view, C.list);
router.get('/new', manage, C.newForm);
router.post('/', manage, upload.single('photo'), verify, C.create);

// Bulk upload
router.get('/bulk', manage, C.bulkForm);
router.get('/bulk/template', manage, C.template);
router.post('/bulk', manage, csvUpload.single('file'), verify, C.bulkUpload);

// Trash / restore
router.get('/trash', view, C.trash);
router.post('/:id/restore', manage, C.restore);

router.get('/:id', view, C.show);
router.get('/:id/edit', manage, C.editForm);
router.post('/:id', manage, upload.single('photo'), verify, C.update);
router.post('/:id/delete', manage, C.softDelete);
router.post('/:id/assign-fees', manage, C.assignFees);

module.exports = router;
