const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), 'uploads');
const UPLOAD_ROOT = path.join(UPLOADS_DIR, 'email-assets');

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function saveImage({ companyId, buffer, mimeType, originalName }) {
  const ext = EXT_BY_MIME[mimeType] || 'bin';
  const key = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  const companyDir = path.join(UPLOAD_ROOT, String(companyId));
  ensureDir(companyDir);
  const filePath = path.join(companyDir, key);
  await fs.promises.writeFile(filePath, buffer);
  const url = `/uploads/email-assets/${companyId}/${key}`;
  return {
    key,
    url,
    size: buffer.length,
    originalName: originalName || key
  };
}

module.exports = {
  saveImage
};
