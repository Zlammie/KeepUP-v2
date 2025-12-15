const router = require('express').Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');
const PasswordToken = require('../models/PasswordToken');
const normalizeRole = require('../utils/normalizeRole');
const {
  issuePasswordToken,
  consumeToken,
  findValidToken,
  loadUserForToken,
  sendResetEmail
} = require('../services/passwordReset');

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

const startUserSession = (req, user, roles) =>
  new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);

      const sessionUser = {
        _id: user._id.toString(),
        email: user.email,
        companyId: String(user.company),
        roles,
        role: roles[0]
      };

      req.session.userId = sessionUser._id; // shape expected by ensureAuth
      req.session.user = sessionUser;       // legacy shape; kept for compatibility

      req.session.save((err2) => {
        if (err2) return reject(err2);
        return resolve();
      });
    });
  });

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

    try {
      await startUserSession(req, user, roles);
    } catch (err) {
      console.error('session regenerate error', err);
      return res.status(500).render('auth/login', { error: 'Something went wrong' });
    }

    return res.redirect('/');
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

const renderForgotPassword = (res, overrides = {}) => {
  const defaults = { status: null, message: '', error: null, values: { email: '' } };
  const values = { ...defaults.values, ...(overrides.values || {}) };
  return res.render('auth/forgot-password', { ...defaults, ...overrides, values });
};

router.get('/forgot-password', (req, res) => renderForgotPassword(res));

router.post('/forgot-password', async (req, res) => {
  const email = (req.body?.email || '').toString().trim().toLowerCase();
  const values = { email };

  if (!email) {
    return res.status(400).render('auth/forgot-password', {
      status: 'error',
      error: 'Enter the email on your account.',
      values
    });
  }

  let user = null;

  try {
    user = await User.findOne({ email, isActive: true })
      .select('_id email firstName lastName status')
      .lean();

    if (!user) {
      return renderForgotPassword(res, {
        status: 'success',
        message: 'If your account exists, you will receive an email shortly.'
      });
    }

    const { token } = await issuePasswordToken({
      userId: user._id,
      type: PasswordToken.TOKEN_TYPES.RESET
    });

    await sendResetEmail({ user, token, req });

    return renderForgotPassword(res, {
      status: 'success',
      message: 'If your account exists, you will receive an email shortly.'
    });
  } catch (err) {
    console.error('[forgot-password] error', err);
    if (user?._id) {
      PasswordToken.deleteMany({
        userId: user._id,
        type: PasswordToken.TOKEN_TYPES.RESET
      }).catch(() => {});
    }
    return res.status(500).render('auth/forgot-password', {
      status: 'error',
      error: 'We could not start a reset right now. Please try again in a moment.',
      values
    });
  }
});

const renderResetPassword = (res, overrides = {}) => {
  const defaults = {
    token: '',
    email: '',
    status: null,
    error: null,
    mode: 'reset'
  };
  return res.render('auth/reset-password', { ...defaults, ...overrides });
};

router.get('/reset-password', async (req, res) => {
  const token = (req.query?.token || '').toString().trim();
  if (!token) {
    return res.status(400).render('auth/reset-password', {
      token: '',
      status: 'error',
      error: 'This reset link is invalid or has expired.'
    });
  }

  try {
    const record = await findValidToken(token);
    if (!record) {
      return res.status(400).render('auth/reset-password', {
        token: '',
        status: 'error',
        error: 'This reset link is invalid or has expired.'
      });
    }

    const user = await loadUserForToken(record);
    if (!user || user.isActive === false) {
      return res.status(400).render('auth/reset-password', {
        token: '',
        status: 'error',
        error: 'This account is not eligible for a password reset.'
      });
    }

    return renderResetPassword(res, {
      token,
      email: user.email,
      status: null,
      mode: record.type === PasswordToken.TOKEN_TYPES.INVITE ? 'invite' : 'reset'
    });
  } catch (err) {
    console.error('[reset-password:get] error', err);
    return res.status(500).render('auth/reset-password', {
      token: '',
      status: 'error',
      error: 'Something went wrong. Please request a new link.'
    });
  }
});

router.post('/reset-password', async (req, res) => {
  const token = (req.body?.token || '').toString().trim();
  const password = (req.body?.password || '').toString();
  const confirmPassword = (req.body?.confirmPassword || '').toString();

  const fail = (statusCode, payload) =>
    res.status(statusCode).render('auth/reset-password', payload);

  if (!token) {
    return fail(400, {
      token: '',
      status: 'error',
      error: 'This reset link is invalid or has expired.'
    });
  }

  if (!password || password.length < 8) {
    return fail(400, {
      token,
      status: 'error',
      error: 'Password must be at least 8 characters long.'
    });
  }

  if (password !== confirmPassword) {
    return fail(400, {
      token,
      status: 'error',
      error: 'Passwords do not match.'
    });
  }

  try {
    const record = await consumeToken(token);
    if (!record) {
      return fail(400, {
        token: '',
        status: 'error',
        error: 'This reset link is invalid or has expired.'
      });
    }

    const user = await User.findById(record.userId);
    if (!user) {
      return fail(400, {
        token: '',
        status: 'error',
        error: 'This account is not eligible for a password reset.'
      });
    }

    if (user.isActive === false && record.type !== PasswordToken.TOKEN_TYPES.INVITE) {
      return fail(400, {
        token: '',
        status: 'error',
        error: 'This account is not eligible for a password reset.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 11);
    user.passwordHash = passwordHash;
    user.mustChangePassword = false;
    if (record.type === PasswordToken.TOKEN_TYPES.INVITE || user.status === User.STATUS.INVITED) {
      user.status = User.STATUS.ACTIVE;
      user.isActive = true;
    }

    await user.save();

    const roles = normalizeRoles(
      Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role].filter(Boolean)
    );

    try {
      await startUserSession(req, user, roles);
    } catch (err) {
      console.error('session regenerate error (reset-password)', err);
      return fail(500, {
        token: '',
        status: 'error',
        error: 'Your password was updated, but we could not sign you in automatically. Please log in.'
      });
    }

    return res.redirect('/');
  } catch (err) {
    console.error('[reset-password:post] error', err);
    return fail(500, {
      token,
      status: 'error',
      error: 'Something went wrong. Please request a new link.'
    });
  }
});

module.exports = router;
