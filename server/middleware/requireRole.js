// middleware/requireRole.js
/**
 * Usage:
 *   router.get('/admin', ensureAuth, requireRole('COMPANY_ADMIN','SUPER_ADMIN'), handler)
 */
module.exports = function requireRole(...allowed) {
  // normalize allowed roles to UPPER_CASE strings
  const allow = allowed.map(r => String(r).toUpperCase());

  return (req, res, next) => {
    // Prefer the normalized user shape set by ensureAuth:
    //   req.user.roles = ['SUPER_ADMIN','USER', ...]
    // Fallback to legacy: req.session.user.role = 'user'
    const roles =
      Array.isArray(req.user?.roles) && req.user.roles.length
        ? req.user.roles.map(r => String(r).toUpperCase())
        : (req.session?.user?.role
            ? [String(req.session.user.role).toUpperCase()]
            : []);

    // SUPER_ADMIN bypass
    if (roles.includes('SUPER_ADMIN')) return next();

    // Any-of match
    const ok = roles.some(r => allow.includes(r));
    if (ok) return next();

    // Not authorized
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.status(403).send('Forbidden');
  };
};
