const express = require('express');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const Company = require('../../models/Company');
const { formatPhoneForDisplay, formatPhoneForStorage } = require('../../utils/phone');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const isSuper = (req) => Array.isArray(req.user?.roles) && req.user.roles.includes('SUPER_ADMIN');

const trimToNull = (value) => {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const normalizeHexColor = (value) => {
  const trimmed = trimToNull(value);
  if (!trimmed) return null;
  const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex) ? hex.toUpperCase() : null;
};

const serializeCompany = (company) => ({
  companyId: String(company._id),
  companyName: company.name,
  slug: company.slug,
  plan: company.plan,
  address: {
    street: company.address?.street || '',
    city: company.address?.city || '',
    state: company.address?.state || '',
    zip: company.address?.zip || ''
  },
  primaryContact: {
    name: company.primaryContact?.name || '',
    email: company.primaryContact?.email || '',
    phone: company.primaryContact?.phone || '',
    phoneDisplay: formatPhoneForDisplay(company.primaryContact?.phone || '')
  },
  branding: {
    logoUrl: company.branding?.logoUrl || '',
    primaryColor: company.branding?.primaryColor || '',
    secondaryColor: company.branding?.secondaryColor || ''
  },
  timezone: company.settings?.timezone || 'America/Chicago',
  notes: company.notes || ''
});

router.get(
  '/',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const requestedCompanyId = req.query.companyId;
      const resolvedCompanyId =
        isSuper(req) && isObjectId(requestedCompanyId) ? requestedCompanyId : req.user.company;

      if (!isObjectId(resolvedCompanyId)) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const company = await Company.findById(resolvedCompanyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      return res.json(serializeCompany(company));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/',
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const {
        companyName,
        slug,
        address = {},
        primaryContact = {},
        notes
      } = req.body || {};

      const trimmedName = trimToNull(companyName);
      if (!trimmedName) {
        return res.status(400).json({ error: 'Company name is required.' });
      }

      const trimmedSlug = trimToNull(slug);
      const existing = await Company.findOne({ name: trimmedName }).select('_id');
      if (existing) {
        return res.status(400).json({ error: 'A company with that name already exists.' });
      }

      const contactEmail = trimToNull(primaryContact.email);
      const normalizedPhone = formatPhoneForStorage(primaryContact.phone || '') || null;

      const company = await Company.create({
        name: trimmedName,
        slug: trimmedSlug || undefined,
        address: {
          street: trimToNull(address.street),
          city: trimToNull(address.city),
          state: trimToNull(address.state),
          zip: trimToNull(address.zip)
        },
        primaryContact: {
          name: trimToNull(primaryContact.name),
          email: contactEmail ? contactEmail.toLowerCase() : null,
          phone: normalizedPhone
        },
        notes: trimToNull(notes) || undefined
      });

      return res.status(201).json(serializeCompany(company));
    } catch (err) {
      if (err?.code === 11000) {
        return res.status(400).json({ error: 'Company name or slug already exists.' });
      }
      return next(err);
    }
  }
);

router.put(
  '/',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const requestedCompanyId = req.body?.companyId;
      const resolvedCompanyId =
        isSuper(req) && isObjectId(requestedCompanyId) ? requestedCompanyId : req.user.company;

      if (!isObjectId(resolvedCompanyId)) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const company = await Company.findById(resolvedCompanyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const {
        companyName,
        address = {},
        primaryContact = {},
        branding = {},
        timezone,
        notes
      } = req.body || {};

      const trimmedName = trimToNull(companyName);
      if (!trimmedName) {
        return res.status(400).json({ error: 'Company name is required.' });
      }

      company.name = trimmedName;

      company.address = {
        street: trimToNull(address.street),
        city: trimToNull(address.city),
        state: trimToNull(address.state),
        zip: trimToNull(address.zip)
      };

      const contactEmail = trimToNull(primaryContact.email);
      const normalizedPhone = formatPhoneForStorage(primaryContact.phone || '') || null;
      company.primaryContact = {
        name: trimToNull(primaryContact.name),
        email: contactEmail ? contactEmail.toLowerCase() : null,
        phone: normalizedPhone
      };

      const normalizedBranding = {
        logoUrl: trimToNull(branding.logoUrl),
        primaryColor: normalizeHexColor(branding.primaryColor),
        secondaryColor: normalizeHexColor(branding.secondaryColor)
      };

      const currentBranding =
        company.branding && typeof company.branding.toObject === 'function'
          ? company.branding.toObject()
          : company.branding || {};
      company.branding = {
        ...currentBranding,
        ...normalizedBranding
      };

      company.notes = trimToNull(notes) || '';

      if (timezone != null) {
        const tzTrimmed = trimToNull(timezone);
        company.settings = company.settings || {};
        company.settings.timezone = tzTrimmed || company.settings.timezone || 'America/Chicago';
      }

      company.markModified('address');
      company.markModified('primaryContact');
      company.markModified('branding');
      company.markModified('settings');

      try {
        await company.save();
      } catch (err) {
        if (err?.code === 11000) {
          return res.status(400).json({ error: 'Company name already exists.' });
        }
        throw err;
      }

      return res.json(serializeCompany(company));
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
