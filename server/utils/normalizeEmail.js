function normalizeEmail(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

module.exports = { normalizeEmail };
