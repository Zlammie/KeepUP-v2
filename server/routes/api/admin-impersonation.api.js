const express = require('express');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const Company = require('../../models/Company');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const buildPayload = async (req, options = {}) => {
  const search = String(options.search || '').trim();
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 25, 1), 100);

  const filter = {};
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [{ name: regex }, { slug: regex }];
  }

  const companies = await Company.find(filter)
    .select('name slug')
    .sort({ name: 1 })
    .limit(limit)
    .lean();

  const active =
    req.session?.impersonation && req.session.impersonation.companyId
      ? {
          companyId: String(req.session.impersonation.companyId),
          companyName: req.session.impersonation.companyName || null,
          startedAt: req.session.impersonation.startedAt || null
        }
      : null;

  const homeCompanyId = req.user?.homeCompany ? String(req.user.homeCompany) : null;

  let homeCompany = null;
  if (homeCompanyId) {
    const homeCompanyDoc = await Company.findById(homeCompanyId).select('name').lean();
    if (homeCompanyDoc) {
      homeCompany = {
        companyId: homeCompanyId,
        companyName: homeCompanyDoc.name || ''
      };
    }
  }

  return {
    active,
    homeCompany,
    companies: companies.map((company) => ({
      id: String(company._id),
      name: company.name || 'Unnamed Company',
      slug: company.slug || ''
    }))
  };
};

router.use(requireRole('SUPER_ADMIN'));

router.get('/', async (req, res, next) => {
  try {
    const payload = await buildPayload(req, {
      search: req.query.search,
      limit: req.query.limit
    });
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const companyId = req.body?.companyId;
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company id' });
    }

    const company = await Company.findById(companyId).select('name').lean();
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    req.session.impersonation = {
      companyId: String(company._id),
      companyName: company.name || '',
      startedAt: new Date().toISOString()
    };

    await new Promise((resolve, reject) => {
      req.session.save((err) => (err ? reject(err) : resolve()));
    });

    const payload = await buildPayload(req, {
      search: req.query.search,
      limit: req.query.limit
    });

    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    if (req.session?.impersonation) {
      delete req.session.impersonation;
      await new Promise((resolve, reject) => {
        req.session.save((err) => (err ? reject(err) : resolve()));
      });
    }

    const payload = await buildPayload(req, {
      search: req.query.search,
      limit: req.query.limit
    });

    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
