// middleware/requireRole.js
/**
 * Usage:
 *   router.get('/admin', ensureAuth, requireRole('COMPANY_ADMIN','SUPER_ADMIN'), handler)
 */
const normalizeRole = require('../utils/normalizeRole');

module.exports = function requireRole(...allowed) {
  // normalize allowed roles to canonical strings
  const allow = allowed
    .map(normalizeRole)
    .filter(Boolean);

  return (req, res, next) => {
    // Prefer the normalized user shape set by ensureAuth:
    //   req.user.roles = ['SUPER_ADMIN','USER', ...]
    // Fallback to legacy: req.session.user.role = 'user'
    const roles =
      Array.isArray(req.user?.roles) && req.user.roles.length
        ? req.user.roles.map(normalizeRole).filter(Boolean)
        : (req.session?.user?.role
            ? [normalizeRole(req.session.user.role)].filter(Boolean)
            : []);

    // SUPER_ADMIN bypass
    if (roles.includes('SUPER_ADMIN')) return next();

    // Any-of match
    const ok = roles.some(r => allow.includes(r));
    if (ok) return next();

    if (process.env.AUTH_DEBUG || process.env.NODE_ENV !== 'production') {
      console.warn('[requireRole] forbidden', {
        path: req.path,
        allow,
        roles
      });
    }

    // Not authorized
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.status(403).send('Forbidden');
  };
};
