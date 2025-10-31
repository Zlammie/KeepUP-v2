// routes/adminCompanyRoutes.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const ensureAuth  = require('../middleware/ensureAuth');
const requireRole = require('../middleware/requireRole');
const Company     = require('../models/Company');

const isId = v => mongoose.Types.ObjectId.isValid(String(v));
const isSuper = req => (req.user?.roles || []).includes('SUPER_ADMIN');
const base = req => (isSuper(req) ? {} : { _id: req.user.company }); // CA sees only their company

router.use(ensureAuth);

// List companies (SUPER sees all; CA sees just theirs)
router.get('/admin/companies',
  requireRole('MANAGER','COMPANY_ADMIN','SUPER_ADMIN'),
  async (req, res) => {
    const companies = await Company.find({ ...base(req) })
      .select('name slug isActive')
      .sort({ name: 1 })
      .lean();
    res.render('pages/admin-companies', { companies, active: 'admin' });
  }
);

// Create company (SUPER only)
router.post('/admin/companies',
  requireRole('SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { name, slug } = req.body || {};
      if (!name?.trim()) return res.status(400).send('Company name is required');
      await Company.create({ name: name.trim(), slug: (slug||'').trim() || undefined });
      res.redirect('/admin/companies');
    } catch (err) {
      const msg = err?.code === 11000 ? 'Company name/slug already exists' : (err.message || 'Failed to create company');
      res.status(400).send(msg);
    }
  }
);

module.exports = router;
