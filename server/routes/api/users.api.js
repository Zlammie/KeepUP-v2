const express = require('express');
const requireRole = require('../../middleware/requireRole');
const User = require('../../models/User');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];

function isCompanyAdmin(req) {
  const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
  return roles.includes('COMPANY_ADMIN') || roles.includes('SUPER_ADMIN');
}

router.get('/select-options', requireRole(...READ_ROLES), async (req, res) => {
  try {
    let users = [];
    if (isCompanyAdmin(req)) {
      users = await User.find({ company: req.user.company })
        .select('firstName lastName email')
        .sort({ firstName: 1, lastName: 1, email: 1 })
        .lean();
    } else if (req.user?._id) {
      users = [{
        _id: req.user._id,
        firstName: req.user.firstName || '',
        lastName: req.user.lastName || '',
        email: req.user.email || ''
      }];
    }

    const options = users.map((user) => {
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
      return {
        id: String(user._id),
        label: name || user.email || 'User'
      };
    });

    res.json({ users: options });
  } catch (err) {
    console.error('[users] select-options failed', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

module.exports = router;
