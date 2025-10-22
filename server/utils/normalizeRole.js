// server/utils/normalizeRole.js
// Convert loose role strings into canonical enum names (e.g., "Super Admin" -> "SUPER_ADMIN")
const CANONICAL = Object.freeze([
  'SUPER_ADMIN',
  'COMPANY_ADMIN',
  'MANAGER',
  'USER',
  'READONLY'
]);

const BY_COLLAPSED = Object.fromEntries(
  CANONICAL.map(role => [role.replace(/_/g, ''), role])
);

module.exports = function normalizeRole(value) {
  if (!value && value !== 0) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  const sanitized = upper
    .replace(/[\s-]+/g, '_')   // spaces & dashes => underscore
    .replace(/[^A-Z_]/g, '');  // drop everything else

  if (CANONICAL.includes(sanitized)) return sanitized;

  const collapsed = sanitized.replace(/_/g, '');
  return BY_COLLAPSED[collapsed] || null;
};
