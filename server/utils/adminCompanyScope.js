const mongoose = require('mongoose');
const normalizeRole = require('./normalizeRole');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

function getNormalizedRoles(req) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  return roles.map(normalizeRole).filter(Boolean);
}

function isSuperAdminRequest(req) {
  return getNormalizedRoles(req).includes('SUPER_ADMIN');
}

function resolveAdminCompanyId(req, incomingCompanyId) {
  if (isSuperAdminRequest(req) && isObjectId(incomingCompanyId)) {
    return String(incomingCompanyId);
  }

  const scopedCompanyId = req.user?.company || req.user?.companyId || null;
  return isObjectId(scopedCompanyId) ? String(scopedCompanyId) : null;
}

module.exports = {
  isObjectId,
  isSuperAdminRequest,
  resolveAdminCompanyId
};
