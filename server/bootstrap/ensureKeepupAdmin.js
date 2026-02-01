const User = require('../models/User');

module.exports = async function ensureKeepupAdmin() {
  const emailRaw = process.env.KEEPUP_ADMIN_EMAIL;
  const email = (emailRaw || '').trim().toLowerCase();
  if (!email) {
    return { status: 'skipped' };
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.warn('[bootstrap] KEEPUP_ADMIN_EMAIL user not found:', email);
      return { status: 'missing' };
    }

    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!roles.includes(User.ROLES.KEEPUP_ADMIN)) {
      user.roles = Array.from(new Set([...roles, User.ROLES.KEEPUP_ADMIN]));
      await user.save();
      console.info('[bootstrap] KEEPUP_ADMIN role applied:', email);
      return { status: 'updated' };
    }

    return { status: 'ok' };
  } catch (err) {
    console.error('[bootstrap] ensureKeepupAdmin failed:', err);
    return { status: 'error', error: err.message };
  }
};
