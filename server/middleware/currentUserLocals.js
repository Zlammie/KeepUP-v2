// server/middleware/currentUserLocals.js
const User = require('../models/User');
const Company = require('../models/Company');

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
      .select('email firstName lastName company')
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

    const currentUser = {
      id: String(authUserId),
      name: displayName,
      company: companyName,
    };

    res.locals.currentUser = currentUser;
    req.currentUser = currentUser;

    next();
  } catch (err) {
    next(err);
  }
};
