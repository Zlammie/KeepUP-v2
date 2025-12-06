const router = require('express').Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');
const normalizeRole = require('../utils/normalizeRole');

const VALID_ROLES = new Set(Object.values(User.ROLES || {}));
const DEFAULT_ROLE = User.ROLES?.USER || 'USER';
const sessionCookieName = process.env.SESSION_COOKIE_NAME || 'sid';
const AUTH_DEBUG = /^(1|true|yes|on)$/i.test(process.env.AUTH_DEBUG || '');

const logDebug = (...args) => {
  if (AUTH_DEBUG || process.env.NODE_ENV !== 'production') console.info(...args);
};

const normalizeRoles = (rawRoles) => {
  const roles = (rawRoles || [])
    .map(normalizeRole)
    .filter((role) => role && VALID_ROLES.has(role));
  return roles.length ? roles : [DEFAULT_ROLE];
};

router.get('/login', (req, res) => {
  if (req.session?.userId || req.session?.user) return res.redirect('/'); // already logged in
  return res.render('auth/login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const identifier = (req.body?.email || req.body?.username || req.body?.identifier || '')
      .trim()
      .toLowerCase();
    const password = (req.body?.password || req.body?.pass || '').trim();

    if (!identifier || !password) {
      logDebug('[login] missing identifier or password', { hasIdentifier: !!identifier });
      return res.status(401).render('auth/login', { error: 'Invalid credentials' });
    }

    const user = await User.findOne({ email: identifier, isActive: true }).lean();
    if (!user) {
      logDebug('[login] user not found', { identifier });
      return res.status(401).render('auth/login', { error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      logDebug('[login] bad password', { identifier });
      return res.status(401).render('auth/login', { error: 'Invalid credentials' });
    }

    const roles = normalizeRoles(
      Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role].filter(Boolean)
    );

    // Regenerate session to avoid fixation and ensure persistence before redirect
    req.session.regenerate((err) => {
      if (err) {
        console.error('session regenerate error', err);
        return res.status(500).render('auth/login', { error: 'Something went wrong' });
      }

      const sessionUser = {
        _id: user._id.toString(),
        email: user.email,
        companyId: String(user.company),
        roles,
        role: roles[0]
      };

      req.session.userId = sessionUser._id; // shape expected by ensureAuth
      req.session.user = sessionUser;       // legacy shape; kept for compatibility

      // Optional: track last login
      // void User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});

      req.session.save((err2) => {
        if (err2) {
          console.error('session save error', err2);
          return res.status(500).render('auth/login', { error: 'Something went wrong' });
        }
        return res.redirect('/');
      });
    });
  } catch (e) {
    console.error(e);
    return res.status(500).render('auth/login', { error: 'Something went wrong' });
  }
});

const destroySession = (req, res, next) => {
  const finish = () => res.redirect('/login');

  const clearSession = () => {
    if (req.session) {
      req.session.destroy(() => {
        res.clearCookie(sessionCookieName);
        finish();
      });
    } else {
      finish();
    }
  };

  if (typeof req.logout === 'function') {
    req.logout((err) => {
      if (err) return next(err);
      clearSession();
    });
  } else {
    clearSession();
  }
};

// GET is fine for now; switch to POST if you want stricter CSRF posture
router.get('/logout', destroySession);
router.post('/logout', destroySession);

module.exports = router;
