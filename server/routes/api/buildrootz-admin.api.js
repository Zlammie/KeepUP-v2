const express = require('express');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const Company = require('../../models/Company');
const Community = require('../../models/Community');
const { publishBuilderProfile } = require('../../services/buildrootzBuilderProfile');
const BuildRootzCommunityRequest = require('../../models/BuildRootzCommunityRequest');
const { buildrootzFetch } = require('../../services/buildrootzClient');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const isSuper = (req) => Array.isArray(req.user?.roles) && req.user.roles.includes('SUPER_ADMIN');
const ADMIN_ROLES = ['MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const { BUILDROOTZ_API_BASE, BUILDROOTZ_INTERNAL_API_KEY } = process.env;

const trimToNull = (value) => {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const normalizeWebsiteUrl = (value) => {
  const trimmed = trimToNull(value);
  if (!trimmed) return '';

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const resolveCompanyId = (req, incomingId) => {
  const requestedCompanyId = incomingId;
  if (isSuper(req) && isObjectId(requestedCompanyId)) return requestedCompanyId;
  return req.user.company;
};

const serializeProfile = (company, builderDoc = null) => {
  const brandingLogo = company.branding?.logoUrl || '';
  const profileLogo = company.buildrootzProfile?.logoUrl || '';
  const description = company.buildrootzProfile?.description || '';
  const websiteUrl = company.buildrootzProfile?.websiteUrl || builderDoc?.websiteUrl || '';

  return {
    companyId: String(company._id),
    builderName: company.name || '',
    slug: company.slug || '',
    logoUrl: profileLogo || brandingLogo || '',
    profileLogoUrl: profileLogo || '',
    companyLogoUrl: brandingLogo || '',
    fallbackLogoUrl: brandingLogo || '',
    description,
    websiteUrl,
    publishedAt: company.buildrootzProfile?.publishedAt || builderDoc?.publishedAt || null,
    builderProfileId: builderDoc?._id ? String(builderDoc._id) : null
  };
};

router.get(
  '/profile',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const resolvedCompanyId = resolveCompanyId(req, req.query.companyId);
      if (!isObjectId(resolvedCompanyId)) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const company = await Company.findById(resolvedCompanyId);
      if (!company) return res.status(404).json({ error: 'Company not found' });

      return res.json(serializeProfile(company));
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/profile',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const resolvedCompanyId = resolveCompanyId(req, req.body?.companyId);
      if (!isObjectId(resolvedCompanyId)) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const { description, companyDescription, logoUrl, websiteUrl } = req.body || {};
      const descriptionInput = description !== undefined ? description : companyDescription;
      const company = await Company.findById(resolvedCompanyId);
      if (!company) return res.status(404).json({ error: 'Company not found' });

      company.buildrootzProfile = company.buildrootzProfile || {};
      if (descriptionInput !== undefined) company.buildrootzProfile.description = trimToNull(descriptionInput) || '';
      if (logoUrl !== undefined) company.buildrootzProfile.logoUrl = trimToNull(logoUrl) || '';
      if (websiteUrl !== undefined) {
        const normalizedWebsite = normalizeWebsiteUrl(websiteUrl);
        if (normalizedWebsite === null) {
          return res.status(400).json({ error: 'Invalid website URL.' });
        }
        company.buildrootzProfile.websiteUrl = normalizedWebsite;
      }
      company.markModified('buildrootzProfile');
      await company.save();

      return res.json(serializeProfile(company));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/profile/publish',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const resolvedCompanyId = resolveCompanyId(req, req.body?.companyId);
      if (!isObjectId(resolvedCompanyId)) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const { description, companyDescription, logoUrl, websiteUrl } = req.body || {};
      const descriptionInput = description !== undefined ? description : companyDescription;
      const company = await Company.findById(resolvedCompanyId);
      if (!company) return res.status(404).json({ error: 'Company not found' });

      company.buildrootzProfile = company.buildrootzProfile || {};
      if (descriptionInput !== undefined) company.buildrootzProfile.description = trimToNull(descriptionInput) || '';
      if (logoUrl !== undefined) company.buildrootzProfile.logoUrl = trimToNull(logoUrl) || '';
      if (websiteUrl !== undefined) {
        const normalizedWebsite = normalizeWebsiteUrl(websiteUrl);
        if (normalizedWebsite === null) {
          return res.status(400).json({ error: 'Invalid website URL.' });
        }
        company.buildrootzProfile.websiteUrl = normalizedWebsite;
      }
      company.buildrootzProfile.publishedAt = new Date();
      company.markModified('buildrootzProfile');
      await company.save();

      const builderDoc = await publishBuilderProfile({
        companyId: company._id,
        name: company.name,
        slug: company.slug,
        logoUrl: company.buildrootzProfile.logoUrl || logoUrl,
        websiteUrl: company.buildrootzProfile.websiteUrl || websiteUrl,
        description: company.buildrootzProfile.description || descriptionInput
      });

      return res.json(serializeProfile(company, builderDoc));
    } catch (err) {
      next(err);
    }
  }
);

// --- Community mapping (KeepUp -> BuildRootz canonical) ---

const serializeCommunityMapping = (community) => ({
  id: String(community._id),
  name: community.name || '',
  city: community.city || '',
  state: community.state || '',
  buildrootz: {
    communityId: community.buildrootz?.communityId || null,
    canonicalName: community.buildrootz?.canonicalName || '',
    mappedAt: community.buildrootz?.mappedAt || null,
  mappedByUserId: community.buildrootz?.mappedByUserId || null
  }
});

const getFetch = async () => {
  if (typeof fetch !== 'undefined') return fetch;
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch;
};

async function buildrootzRequest(path, { method = 'GET', body, signal } = {}) {
  if (!BUILDROOTZ_API_BASE || !BUILDROOTZ_INTERNAL_API_KEY) {
    const err = new Error('BuildRootz API not configured');
    err.status = 500;
    throw err;
  }
  const fetchFn = await getFetch();
  const url = `${BUILDROOTZ_API_BASE.replace(/\/+$/, '')}${path}`;
  const headers = {
    Accept: 'application/json',
    'x-api-key': BUILDROOTZ_INTERNAL_API_KEY
  };
  const opts = { method, headers, signal };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetchFn(url, opts);
  const resBody = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const err = new Error('BUILDROOTZ_AUTH_FAILED');
    err.status = 500;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(resBody?.error || `BuildRootz request failed (${res.status})`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  return resBody;
}

router.get(
  '/communities',
  requireRole(...ADMIN_ROLES),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.query.companyId);
      if (!isObjectId(companyId)) return res.status(400).json({ error: 'Invalid company context' });

      const communities = await Community.find({ company: companyId })
        .select('name city state buildrootz')
        .sort({ name: 1 })
        .lean();

      return res.json(communities.map(serializeCommunityMapping));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/br-communities/search',
  requireRole(...ADMIN_ROLES),
  async (req, res, next) => {
    try {
      const q = (req.query.q || '').toString().trim();
      if (!q || q.length < 2) return res.json({ results: [] });

      const data = await buildrootzRequest(`/api/internal/communities/search?q=${encodeURIComponent(q)}`);
      return res.json({ results: Array.isArray(data) ? data : data.results || [] });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/communities/:communityId/map',
  requireRole(...ADMIN_ROLES),
  async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const brId = (req.body?.buildrootzCommunityId || '').toString().trim();
      const companyId = resolveCompanyId(req, req.body?.companyId);

      if (!isObjectId(companyId)) return res.status(400).json({ error: 'Invalid company context' });
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid community id' });
      if (!isObjectId(brId)) return res.status(400).json({ error: 'Invalid BuildRootz community id' });

      let brCommunity;
      try {
        brCommunity = await buildrootzRequest(`/api/internal/communities/${brId}`);
      } catch (err) {
        if (err.status === 404) return res.status(404).json({ error: 'BUILDROOTZ_COMMUNITY_NOT_FOUND' });
        if (err.message === 'BUILDROOTZ_AUTH_FAILED') return res.status(500).json({ error: 'BUILDROOTZ_AUTH_FAILED' });
        return res.status(err.status || 502).json({ error: err.message || 'BUILDROOTZ_UNAVAILABLE' });
      }

      const community = await Community.findOne({ _id: communityId, company: companyId });
      if (!community) return res.status(404).json({ error: 'Community not found' });

      community.buildrootz = community.buildrootz || {};
      community.buildrootz.communityId = brCommunity._id;
      community.buildrootz.canonicalName = brCommunity.name || '';
      community.buildrootz.mappedAt = new Date();
      community.buildrootz.mappedByUserId = req.user?._id || null;
      community.markModified('buildrootz');
      await community.save();

      return res.json(serializeCommunityMapping(community));
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/communities/:communityId/map',
  requireRole(...ADMIN_ROLES),
  async (req, res, next) => {
    try {
      const { communityId } = req.params;
      const companyId = resolveCompanyId(req, req.body?.companyId);
      if (!isObjectId(companyId)) return res.status(400).json({ error: 'Invalid company context' });
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid community id' });

      const community = await Community.findOne({ _id: communityId, company: companyId });
      if (!community) return res.status(404).json({ error: 'Community not found' });

      community.buildrootz = {
        communityId: null,
        canonicalName: '',
        mappedAt: null,
        mappedByUserId: null
      };
      community.markModified('buildrootz');
      await community.save();

      return res.json(serializeCommunityMapping(community));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/community-requests/:communityId/status',
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { communityId } = req.params;
      const companyId = resolveCompanyId(req, req.query?.companyId);
      if (!isObjectId(companyId)) return res.status(400).json({ error: 'Invalid company context' });
      if (!isObjectId(communityId)) return res.status(400).json({ error: 'Invalid community id' });

      const community = await Community.findOne({ _id: communityId, company: companyId });
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const latestReq = await BuildRootzCommunityRequest.findOne({
        keepupCommunityId: communityId,
        companyId
      }).sort({ submittedAt: -1 });

      if (!latestReq) return res.status(404).json({ error: 'NO_REQUEST' });

      // Mirror resolved mapping if already handled
      if (['approved', 'linked'].includes(latestReq.status) && latestReq.resolvedBuildRootzCommunityId) {
        community.buildrootz = community.buildrootz || {};
        community.buildrootz.communityId = latestReq.resolvedBuildRootzCommunityId;
        community.buildrootz.canonicalName = latestReq.resolvedCanonicalName || community.buildrootz.canonicalName || '';
        community.buildrootz.mappedAt = community.buildrootz.mappedAt || latestReq.reviewedAt || new Date();
        community.buildrootz.mappedByUserId = community.buildrootz.mappedByUserId || latestReq.reviewedByUserId || req.user?._id || null;
        community.markModified('buildrootz');
        await community.save().catch(() => {});
      }

      return res.json({
        status: latestReq.status,
        requestId: String(latestReq._id),
        communityId: community.buildrootz?.communityId || null,
        canonicalName: community.buildrootz?.canonicalName || latestReq.resolvedCanonicalName || null,
        rejectedReason: latestReq.rejectedReason || null
      });
    } catch (err) {
      console.error('[buildrootz request status]', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

// ---- Community creation request (KeepUp -> Admin queue) ----
router.post(
  '/community-requests',
  requireRole(...ADMIN_ROLES),
  async (req, res) => {
    try {
      const { keepupCommunityId, requestedName, city, state, notes } = req.body || {};
      const companyId = resolveCompanyId(req, req.body?.companyId);
      if (!isObjectId(companyId)) return res.status(400).json({ error: 'Invalid company context' });
      if (!isObjectId(keepupCommunityId)) return res.status(400).json({ error: 'Invalid community id' });
      if (!requestedName || !city || !state) {
        return res.status(400).json({ error: 'requestedName, city, and state are required' });
      }

      const community = await Community.findOne({ _id: keepupCommunityId, company: companyId })
        .select('name company buildrootz')
        .lean();
      if (!community) return res.status(404).json({ error: 'Community not found' });

      const doc = await BuildRootzCommunityRequest.create({
        keepupCommunityId,
        companyId,
        requestedName: requestedName.toString().trim(),
        city: city.toString().trim(),
        state: state.toString().trim(),
        notes: (notes || '').toString(),
        status: 'pending',
        submittedByUserId: req.user?._id,
        submittedAt: new Date()
      });

      // Mirror minimal status on community for UI continuity
      await Community.findByIdAndUpdate(keepupCommunityId, {
        $set: {
          'buildrootz.request': {
            requestId: String(doc._id),
            status: 'pending',
            requestedName: requestedName.toString().trim(),
            requestedAt: new Date(),
            lastCheckedAt: new Date(),
            resolvedCommunityId: null,
            resolvedAt: null,
            rejectedReason: ''
          }
        }
      }).catch(() => {});

      // Optional: notify admins (placeholder)
      console.info('[buildrootz] community creation request created', { id: String(doc._id) });

      return res.json({ ok: true, requestId: String(doc._id) });
    } catch (err) {
      console.error('[buildrootz community request create]', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
