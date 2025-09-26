// middleware/ensureAuth.js
const User = require('../models/User'); // works with current model; also future-proofs for roles[]

/**
 * Unified auth gate:
 * - If not authenticated:
 *    - API paths get 401 JSON
 *    - Page requests get redirected to /login
 * - If authenticated:
 *    - Loads user from DB (lean)
 *    - Normalizes req.user = { _id, email, company, roles[], allowedCommunityIds[] }
 */
module.exports = async function ensureAuth(req, res, next) {
  try {
    // Normalize how we store the session principal:
    // Prefer session.userId; fall back to session.user._id (legacy).
    let userId = req.session?.userId;
    if (!userId && req.session?.user && req.session.user._id) {
      userId = req.session.user._id;
      // Optional one-time upgrade:
      req.session.userId = userId;
      delete req.session.user; // stop storing whole user objects in session
    }

    if (!userId) {
      // Not logged in
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.redirect('/login');
    }

    // Load the user with only what we need
    const u = await User.findById(userId)
      .select('email company companyId roles role allowedCommunityIds isActive')
      .lean();

    if (!u || u.isActive === false) {
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      return res.redirect('/login');
    }

    // ---- Normalize shape for routes ----
    // roles: prefer array; fall back to single role → uppercased array
    const rolesArr = Array.isArray(u.roles) && u.roles.length
      ? u.roles.map(r => String(r).toUpperCase())
      : [String(u.role || 'user').toUpperCase()];

    // company: prefer 'company'; fall back to 'companyId'
    const companyId = u.company || u.companyId;

    // allowedCommunityIds: default to [] (means "all communities in this company")
    const allowed = Array.isArray(u.allowedCommunityIds) ? u.allowedCommunityIds : [];

    req.user = {
      _id: u._id,
      email: u.email,
      company: companyId,
      roles: rolesArr,
      allowedCommunityIds: allowed
    };

    return next();
  } catch (err) {
    console.error('ensureAuth error:', err);
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
  }
};
