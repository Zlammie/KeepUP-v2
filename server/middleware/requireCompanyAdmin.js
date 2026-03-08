const normalizeRole = require('../utils/normalizeRole');

module.exports = function requireCompanyAdmin(req, res, next) {
  const roles =
    Array.isArray(req.user?.roles) && req.user.roles.length
      ? req.user.roles.map(normalizeRole).filter(Boolean)
      : [];

  if (roles.includes('COMPANY_ADMIN')) {
    return next();
  }

  const isApiRequest =
    String(req.originalUrl || '').startsWith('/api/') ||
    String(req.baseUrl || '').startsWith('/api/');

  if (isApiRequest) {
    return res.status(403).json({ error: 'Company admin required' });
  }

  return res.status(403).send('Forbidden');
};
