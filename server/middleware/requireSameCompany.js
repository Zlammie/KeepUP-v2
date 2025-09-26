module.exports = function requireSameCompany(req, res, next) {
  // For admin pages that manage users in the same company
  module.exports = function requireSameCompany(req, res, next) {
  const companyId = req.user?.company || req.session?.user?.companyId; // fallback for legacy
  req.scope = { companyId };
  next();
};
  next();
};
