const express = require('express');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const Company = require('../../models/Company');
const Community = require('../../models/Community');
const FeatureRequest = require('../../models/FeatureRequest');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const isSuper = (req) => Array.isArray(req.user?.roles) && req.user.roles.includes('SUPER_ADMIN');

const resolveCompanyId = (req, rawCompanyId) => {
  const scopedCompanyId = isSuper(req) && isObjectId(rawCompanyId)
    ? rawCompanyId
    : req.user.company;
  return isObjectId(scopedCompanyId) ? scopedCompanyId : null;
};

const normalizeFeature = (value) => String(value || '').trim();

router.get(
  '/overview',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.query.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const [company, communities, pendingRequests] = await Promise.all([
        Company.findById(companyId),
        Community.find({ company: companyId }).select('name websiteMap').lean(),
        FeatureRequest.find({
          companyId,
          status: 'pending',
          feature: { $in: ['buildrootz', 'websiteMap'] }
        })
          .select('feature communityId status createdAt')
          .lean()
      ]);

      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const buildrootzPending = pendingRequests.some(
        (request) => request.feature === 'buildrootz' && !request.communityId
      );
      const websiteMapPendingSet = new Set(
        pendingRequests
          .filter((request) => request.feature === 'websiteMap' && request.communityId)
          .map((request) => String(request.communityId))
      );

      const featureData = company.features || {};
      const buildrootzFeature = featureData.buildrootz || {};
      const buildrootzStatusRaw = buildrootzFeature.status || (buildrootzFeature.enabled ? 'active' : 'inactive');
      const buildrootzStatus = buildrootzStatusRaw === 'inactive' && buildrootzPending
        ? 'pending'
        : buildrootzStatusRaw;

      const websiteMapFeature = featureData.websiteMap || {};
      const websiteMapEntitlements = company.entitlements?.websiteMap || {};

      const communityPayload = communities.map((community) => ({
        id: String(community._id),
        name: community.name || 'Unnamed Community',
        websiteMap: {
          status: community.websiteMap?.status || 'inactive',
          trialEndsAt: community.websiteMap?.trialEndsAt || null,
          setupFeeApplied: !!community.websiteMap?.setupFeeApplied
        },
        pendingRequest: websiteMapPendingSet.has(String(community._id))
      }));

      return res.json({
        companyId: String(companyId),
        serverTime: new Date().toISOString(),
        features: {
          buildrootz: {
            enabled: !!buildrootzFeature.enabled,
            status: buildrootzStatus
          },
          websiteMap: {
            enabled: !!websiteMapFeature.enabled
          }
        },
        entitlements: {
          websiteMap: {
            freeCommunitySetups: Number(websiteMapEntitlements.freeCommunitySetups || 0),
            trialDaysOverride:
              websiteMapEntitlements.trialDaysOverride === null
                ? null
                : Number(websiteMapEntitlements.trialDaysOverride || 0)
          }
        },
        pendingRequests: {
          buildrootz: buildrootzPending,
          websiteMap: Array.from(websiteMapPendingSet)
        },
        communities: communityPayload
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/feature-requests',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const { feature, communityId, companyId: rawCompanyId } = req.body || {};
      const normalizedFeature = normalizeFeature(feature);
      if (!['buildrootz', 'websiteMap'].includes(normalizedFeature)) {
        return res.status(400).json({ error: 'Invalid feature.' });
      }

      const companyId = resolveCompanyId(req, rawCompanyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      let community = null;
      let communityObjectId = null;
      if (normalizedFeature === 'websiteMap') {
        if (!isObjectId(communityId)) {
          return res.status(400).json({ error: 'Valid communityId is required.' });
        }
        communityObjectId = new mongoose.Types.ObjectId(communityId);
        community = await Community.findOne({ _id: communityObjectId, company: companyId });
        if (!community) {
          return res.status(404).json({ error: 'Community not found.' });
        }
      }

      const existing = await FeatureRequest.findOne({
        companyId,
        feature: normalizedFeature,
        communityId: communityObjectId,
        status: 'pending'
      }).select('_id');
      if (existing) {
        return res.json({ requestId: String(existing._id), status: 'pending' });
      }

      const request = await FeatureRequest.create({
        companyId,
        feature: normalizedFeature,
        communityId: communityObjectId,
        status: 'pending',
        createdByUserId: req.user?._id || null
      });

      if (normalizedFeature === 'buildrootz') {
        const company = await Company.findById(companyId);
        if (company) {
          company.features = company.features || {};
          company.features.buildrootz = company.features.buildrootz || {};
          const currentStatus =
            company.features.buildrootz.status || (company.features.buildrootz.enabled ? 'active' : 'inactive');
          if (!['active', 'trial'].includes(currentStatus)) {
            company.features.buildrootz.status = 'pending';
            company.features.buildrootz.enabled = false;
            company.markModified('features');
            await company.save();
          }
        }
      }

      return res.status(201).json({ requestId: String(request._id), status: 'pending' });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/website-map/trial',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const { communityId, companyId: rawCompanyId } = req.body || {};
      const companyId = resolveCompanyId(req, rawCompanyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }
      if (!isObjectId(communityId)) {
        return res.status(400).json({ error: 'Valid communityId is required.' });
      }

      const community = await Community.findOne({ _id: communityId, company: companyId });
      if (!community) {
        return res.status(404).json({ error: 'Community not found.' });
      }

      const currentStatus = community.websiteMap?.status || 'inactive';
      if (currentStatus !== 'inactive') {
        return res.status(400).json({ error: 'Trial is not available for this community.' });
      }
      if (community.websiteMap?.trialEndsAt) {
        return res.status(400).json({ error: 'Trial has already been used.' });
      }

      const pendingRequest = await FeatureRequest.findOne({
        companyId,
        feature: 'websiteMap',
        communityId: community._id,
        status: 'pending'
      }).select('_id');
      if (pendingRequest) {
        return res.status(400).json({ error: 'Activation request is already pending.' });
      }

      const company = await Company.findById(companyId).select('entitlements features');
      const trialOverride = company?.entitlements?.websiteMap?.trialDaysOverride;
      const trialDays = Number.isFinite(trialOverride) && trialOverride > 0 ? trialOverride : 14;
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

      community.websiteMap = community.websiteMap || {};
      community.websiteMap.status = 'trial';
      community.websiteMap.trialEndsAt = trialEndsAt;
      community.markModified('websiteMap');
      await community.save();

      if (company) {
        company.features = company.features || {};
        company.features.websiteMap = company.features.websiteMap || {};
        company.features.websiteMap.enabled = true;
        company.markModified('features');
        await company.save();
      }

      return res.json({
        communityId: String(community._id),
        status: community.websiteMap.status,
        trialEndsAt: community.websiteMap.trialEndsAt
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
