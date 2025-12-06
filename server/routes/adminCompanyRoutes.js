// NOTE: Legacy admin companies page router is disabled. If no errors surface, delete this file.
// Keeping an empty router export so requires won't break; original implementation is preserved below.
const router = require('express').Router();
module.exports = router;

/* Original implementation kept for reference:
const express = require('express');
const router = express.Router();

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');
const Company     = require('../models/Company');

const isSuper = (req) => (req.user?.roles || []).includes('SUPER_ADMIN');
// Company Admins/Managers see only their company; SUPER_ADMIN sees all
const scopeFilter = (req) => (isSuper(req) ? {} : { _id: req.user?.company });

router.use(ensureAuth);
// All routes under /admin/companies need admin/manager access at minimum
router.use('/admin/companies', requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'));

// List companies (SUPER sees all; CA sees just theirs)
router.get('/admin/companies', async (req, res, next) => {
  try {
    const companies = await Company.find(scopeFilter(req))
      .select('name slug isActive')
      .sort({ name: 1 })
      .lean();

    return res.render('pages/admin-companies', { companies, active: 'admin' });
  } catch (err) {
    return next(err);
  }
});

// Create company (SUPER only)
router.post('/admin/companies',
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const name = (req.body?.name || '').trim();
      const slug = (req.body?.slug || '').trim() || undefined;

      if (!name) return res.status(400).send('Company name is required');

      await Company.create({ name, slug });
      return res.redirect('/admin/companies');
    } catch (err) {
      const msg = err?.code === 11000 ? 'Company name/slug already exists' : (err.message || 'Failed to create company');
      return res.status(400).send(msg);
    }
  }
);

module.exports = router;
*/
