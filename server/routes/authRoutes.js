const router = require('express').Router();
const bcrypt = require('bcrypt');
const User = require('../models/User');
const normalizeRole = require('../utils/normalizeRole');

const VALID_ROLES = new Set(Object.values(User.ROLES || {}));
const DEFAULT_ROLE = User.ROLES?.USER || 'USER';

router.get('/login', (req, res) => {
  if (req.session?.user) return res.redirect('/'); // already logged in
  res.render('auth/login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await User.findOne({ email, isActive: true }).lean();
    if (!user) {
      return res.status(401).render('auth/login', { error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).render('auth/login', { error: 'Invalid credentials' });
    }

    // Regenerate session to avoid fixation and ensure persistence before redirect
    req.session.regenerate(async (err) => {
      if (err) {
        console.error('session regenerate error', err);
        return res.status(500).render('auth/login', { error: 'Something went wrong' });
      }

      const rawRoles = Array.isArray(user.roles) && user.roles.length
        ? user.roles
        : [user.role].filter(Boolean);

      const roles = rawRoles
        .map(normalizeRole)
        .filter(role => role && VALID_ROLES.has(role));

      if (!roles.length) roles.push(DEFAULT_ROLE);

      req.session.user = {
        _id: user._id.toString(),
        email: user.email,
        companyId: String(user.company),             // works whether or not virtuals are present
        roles,
        role: roles[0],
      };

      // (optional) track last login
      // await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

      req.session.save((err2) => {
        if (err2) {
          console.error('session save error', err2);
          return res.status(500).render('auth/login', { error: 'Something went wrong' });
        }
        return res.redirect('/'); // ✅ go to index after login
      });
    });
  } catch (e) {
    console.error(e);
    res.status(500).render('auth/login', { error: 'Something went wrong' });
  }
});

// GET is fine for now; switch to POST if you want stricter CSRF posture
router.get('/logout', (req, res, next) => {
  // Passport ≥0.6: req.logout takes a callback
  req.logout(err => {
    if (err) return next(err);

    // destroy the session to clear everything
    if (req.session) {
      req.session.destroy(() => {
        // optional: also clear the cookie by name if you set a custom name
        // res.clearCookie('connect.sid'); // default cookie name for express-session
        res.redirect('/login'); // or '/'
      });
    } else {
      res.redirect('/login');
    }
  });
});

router.post('/logout', (req, res) => {
  const cookieName = 'connect.sid'; // change if you customized it in express-session
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie(cookieName);
      res.redirect('/login');
    });
  } else {
    res.redirect('/login');
  }
});;
module.exports = router;
