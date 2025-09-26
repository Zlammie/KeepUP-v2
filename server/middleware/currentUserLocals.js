// server/middleware/currentUserLocals.js
const User = require('../models/User');
const Company = require('../models/Company');

module.exports = async function currentUserLocals(req, res, next) {
  try {
    // Only decorate server-rendered pages (skip JSON APIs)
    if (req.path.startsWith('/api/')) return next();

    // Accept either req.user (passport) or req.session.user (custom)
    const sessionUser = req.session?.user || null;
    const authUserId = req.user?._id || sessionUser?._id;

    if (!authUserId) {
      res.locals.currentUser = null;
      return next();
    }

    // Pull minimal fields for display (use lean() for speed)
    const user = await User.findById(authUserId)
      .select('email firstName lastName company')
      .lean();

    let companyName = '—';
    const companyId = user?.company || sessionUser?.company || sessionUser?.companyId;

    if (companyId) {
      const company = await Company.findById(companyId).select('name').lean();
      if (company?.name) companyName = company.name;
    }

    res.locals.currentUser = {
      id: String(authUserId),
      name: [user?.firstName, user?.lastName].filter(Boolean).join(' ')
            || user?.email
            || sessionUser?.email
            || 'User',
      company: companyName,
    };

    next();
  } catch (err) {
    next(err);
  }
};
