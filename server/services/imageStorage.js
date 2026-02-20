const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const publicRoot = path.join(process.cwd(), 'public');
const brzUploadsRoot = path.join(publicRoot, 'uploads', 'brz');

const toSafeSegment = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

const sanitizeFilename = (filename = '') => {
  const parsed = path.parse(filename);
  const ext = (parsed.ext || '').toLowerCase();
  const base = String(parsed.name || '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const finalBase = base || 'file';
  return `${finalBase}${ext}`;
};

const moveFile = async (src, dest) => {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if (err?.code !== 'EXDEV') throw err;
    await fs.copyFile(src, dest);
    await fs.unlink(src);
  }
};

async function readDimensions(absPath) {
  try {
    const metadata = await sharp(absPath).metadata();
    return {
      width: Number.isFinite(metadata?.width) ? metadata.width : null,
      height: Number.isFinite(metadata?.height) ? metadata.height : null
    };
  } catch (_) {
    return { width: null, height: null };
  }
}

async function saveImage(file, folder = 'misc') {
  if (!file?.path) {
    const err = new Error('Missing file payload');
    err.status = 400;
    throw err;
  }

  const safeFolder = toSafeSegment(folder) || 'misc';
  const destinationDir = path.join(brzUploadsRoot, safeFolder);
  await fs.mkdir(destinationDir, { recursive: true });

  const stampedName = `${Date.now()}-${sanitizeFilename(file.originalname || file.filename || 'upload')}`;
  const destinationPath = path.join(destinationDir, stampedName);
  await moveFile(file.path, destinationPath);

  const stats = await fs.stat(destinationPath);
  const dims = await readDimensions(destinationPath);
  const key = path.relative(publicRoot, destinationPath).replace(/\\/g, '/');

  return {
    url: `/public/${key}`,
    key,
    contentType: String(file.mimetype || ''),
    bytes: Number.isFinite(stats?.size) ? stats.size : Number(file.size || 0) || null,
    width: dims.width,
    height: dims.height,
    variants: null
  };
}

module.exports = {
  saveImage
};
