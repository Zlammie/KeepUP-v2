const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const DEFAULT_MAX_MB = 20;
const DEFAULT_MAX_FILES = 25;
const FALLBACK_DIR = path.resolve(process.cwd(), 'uploads');

function resolveMaxBytes() {
  const raw = parseInt(process.env.MAX_UPLOAD_MB || '', 10);
  const mb = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_MB;
  return mb * 1024 * 1024;
}

function resolveMaxFiles() {
  const raw = parseInt(process.env.MAX_UPLOAD_FILES || '', 10);
  const n = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_FILES;
  return n;
}

function resolveAllowedTypes() {
  return new Set(
    String(process.env.ALLOWED_UPLOAD_TYPES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const MAX_UPLOAD_BYTES = resolveMaxBytes();
const MAX_UPLOAD_FILES = resolveMaxFiles();
const ALLOWED_MIME = resolveAllowedTypes();
const ALLOWED_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.pdf',
  '.csv',
  '.tsv',
  '.xls',
  '.xlsx',
  '.xlsm',
]);

const uploadDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : FALLBACK_DIR;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdir(uploadDir, { recursive: true }, (mkdirErr) => {
      if (mkdirErr) return cb(mkdirErr);
      return cb(null, uploadDir);
    });
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
    cb(null, safeName);
  },
});

function fileFilter(_req, file, cb) {
  const mimeOk = ALLOWED_MIME.size === 0 || ALLOWED_MIME.has(file.mimetype);
  const extOk = ALLOWED_EXT.has(path.extname(file.originalname || '').toLowerCase());

  if (mimeOk && extOk) return cb(null, true);
  return cb(new Error(`Unsupported file type: ${file.mimetype} (${file.originalname})`));
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_UPLOAD_FILES },
  fileFilter,
});

module.exports = upload;
