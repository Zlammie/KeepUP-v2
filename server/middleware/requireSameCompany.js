module.exports = function requireSameCompany(req, res, next) {
  const companyId = req.user?.company || req.session?.user?.companyId;
  req.scope = { companyId };
  next();
};
