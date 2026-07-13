'use strict';

/**
 * Shared file-upload configuration (multer). Used for student/faculty photos,
 * book covers, notice attachments, etc. Files are stored under public/uploads.
 */

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const config = require('../config');

if (!fs.existsSync(config.uploads.dir)) {
  fs.mkdirSync(config.uploads.dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploads.dir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(12).toString('hex') + ext;
    cb(null, name);
  },
});

const imageFilter = (req, file, cb) => {
  const ok = /image\/(png|jpe?g|gif|webp)/.test(file.mimetype);
  cb(ok ? null : new Error('Only image files are allowed.'), ok);
};

const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxFileSize },
  fileFilter: imageFilter,
});

/** Public URL for an uploaded filename. */
function uploadUrl(filename) {
  return filename ? `/uploads/${filename}` : null;
}

// In-memory upload for CSV/Excel imports (parsed, not stored).
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB (~5k rows)
});

// Any-file disk upload (e.g. expense bill attachments: images or PDFs).
const fileUpload = multer({
  storage,
  limits: { fileSize: config.uploads.maxFileSize },
});

module.exports = { upload, csvUpload, fileUpload, uploadUrl };
