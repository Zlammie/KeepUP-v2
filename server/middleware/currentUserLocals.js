// server/middleware/currentUserLocals.js
const User = require('../models/User');
const Company = require('../models/Company');
const normalizeRole = require('../utils/normalizeRole');

module.exports = async function currentUserLocals(req, res, next) {
  try {
    // Only decorate server-rendered pages (skip JSON APIs)
    if (req.path.startsWith('/api/')) return next();

    // Gather candidate identifiers from both legacy and normalized session data
    const sessionUser = req.session?.user || null;
    const sessionUserId = req.session?.userId || null;
    const authUserId = req.user?._id || sessionUser?._id || sessionUserId;

    if (!authUserId) {
      res.locals.currentUser = null;
      return next();
    }

    // Pull minimal fields for display (use lean() for speed)
    const user = await User.findById(authUserId)
      .select('email firstName lastName company roles role')
      .lean();

    if (!user) {
      res.locals.currentUser = null;
      return next();
    }

    const companyId =
      user.company ||
      sessionUser?.company ||
      sessionUser?.companyId;

    let companyName = 'N/A';
    if (companyId) {
      const company = await Company.findById(companyId).select('name').lean();
      if (company?.name) companyName = company.name;
    }

    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      user.email ||
      sessionUser?.email ||
      'User';

    const rawRoles = Array.isArray(user.roles) && user.roles.length
      ? user.roles
      : []
          .concat(sessionUser?.roles || [])
          .concat(sessionUser?.role || [])
          .concat(user.role || []);

    const canonicalRoles = rawRoles
      .map(normalizeRole)
      .filter(Boolean);

    const uniqueRoles = Array.from(new Set(canonicalRoles));
    const roleSet = new Set(uniqueRoles);

    const isSuperAdmin = roleSet.has(User.ROLES ? User.ROLES.SUPER_ADMIN : 'SUPER_ADMIN');
    const isCompanyAdmin = roleSet.has(User.ROLES ? User.ROLES.COMPANY_ADMIN : 'COMPANY_ADMIN');
    const isManager = roleSet.has(User.ROLES ? User.ROLES.MANAGER : 'MANAGER');

    const canManageUsers = isManager || isCompanyAdmin || isSuperAdmin;
    const canEditCompany = isCompanyAdmin || isSuperAdmin;

    const impersonationSession =
      req.session?.impersonation && req.session.impersonation.companyId
        ? {
            companyId: String(req.session.impersonation.companyId),
            companyName: req.session.impersonation.companyName || null,
            startedAt: req.session.impersonation.startedAt || null
          }
        : null;

    let impersonationName = impersonationSession?.companyName || null;
    if (impersonationSession?.companyId && !impersonationName) {
      const impersonatedCompany = await Company.findById(impersonationSession.companyId).select('name').lean();
      if (impersonatedCompany?.name) {
        impersonationName = impersonatedCompany.name;
        if (req.session && req.session.impersonation) {
          req.session.impersonation.companyName = impersonationName;
        }
      }
    }
    const effectiveCompanyName = impersonationName || companyName;

    const currentUser = {
      id: String(authUserId),
      name: displayName,
      company: companyName,
      effectiveCompany: effectiveCompanyName,
      roles: uniqueRoles,
      impersonation: impersonationSession
    };

    res.locals.currentUser = currentUser;
    res.locals.authRoles = uniqueRoles;
    res.locals.hasRole = (role) => !!role && roleSet.has(normalizeRole(role));
    res.locals.permissions = {
      roles: uniqueRoles,
      isSuperAdmin,
      isCompanyAdmin,
      isManager,
      canAccessAdminSection: canManageUsers,
      canManageUsers,
      canEditCompany,
      canUseImpersonation: isSuperAdmin,
      isImpersonating: Boolean(impersonationSession?.companyId && isSuperAdmin),
      impersonation: impersonationSession,
      effectiveCompanyName
    };
    req.currentUser = currentUser;

    next();
  } catch (err) {
    next(err);
  }
};
