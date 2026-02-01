const express = require('express');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const Company = require('../../models/Company');
const Community = require('../../models/Community');
const FeatureRequest = require('../../models/FeatureRequest');
const { getSeatCounts } = require('../../utils/seatCounts');
const { pricingConfig, formatCents } = require('../../config/pricingConfig');
const { computeEstimatedMonthlySummary, isTrialExpired, getTrialCountdown } = require('../../utils/billingMath');

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

      const [company, communities, pendingRequests, seatCounts] = await Promise.all([
        Company.findById(companyId),
        Community.find({ company: companyId }).select('name websiteMap').lean(),
        FeatureRequest.find({
          companyId,
          status: 'pending',
          feature: { $in: ['buildrootz', 'websiteMap'] }
        })
          .select('feature communityId status createdAt action')
          .lean(),
        getSeatCounts(companyId)
      ]);

      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const pendingBuildrootzEnable = pendingRequests.some(
        (request) => request.feature === 'buildrootz' && (request.action || 'enable') === 'enable'
      );
      const pendingBuildrootzCancel = pendingRequests.some(
        (request) => request.feature === 'buildrootz' && (request.action || 'enable') === 'cancel'
      );
      const websiteMapEnableSet = new Set(
        pendingRequests
          .filter((request) => request.feature === 'websiteMap' && (request.action || 'enable') === 'enable' && request.communityId)
          .map((request) => String(request.communityId))
      );
      const websiteMapCancelSet = new Set(
        pendingRequests
          .filter((request) => request.feature === 'websiteMap' && (request.action || 'enable') === 'cancel' && request.communityId)
          .map((request) => String(request.communityId))
      );
      const websiteMapCancelAll = pendingRequests.some(
        (request) => request.feature === 'websiteMap' && (request.action || 'enable') === 'cancel' && !request.communityId
      );

      const featureData = company.features || {};
      const buildrootzFeature = featureData.buildrootz || {};
      const buildrootzStatusRaw = buildrootzFeature.status || (buildrootzFeature.enabled ? 'active' : 'inactive');
      const buildrootzDisplayStatus = pendingBuildrootzCancel
        ? 'pending_cancel'
        : pendingBuildrootzEnable
          ? 'pending_enable'
          : ['active', 'trial'].includes(buildrootzStatusRaw)
            ? 'active'
            : 'inactive';

      const websiteMapFeature = featureData.websiteMap || {};
      const websiteMapEntitlements = company.entitlements?.websiteMap || {};
      const now = new Date();

      const communityPayload = communities.map((community) => {
        const id = String(community._id);
        const rawStatus = community.websiteMap?.status || 'inactive';
        const trialExpired = isTrialExpired(community.websiteMap, now);
        const trialCountdown = getTrialCountdown(community.websiteMap?.trialEndsAt, now);
        const hasActiveTrial = rawStatus === 'trial' && !trialExpired;
        const pendingEnable = websiteMapEnableSet.has(id);
        const pendingCancel = websiteMapCancelAll || websiteMapCancelSet.has(id);
        let displayStatus = rawStatus;
        if (pendingCancel) {
          displayStatus = 'pending_cancel';
        } else if (pendingEnable) {
          displayStatus = 'pending_enable';
        } else if (rawStatus === 'trial' && trialExpired) {
          displayStatus = 'trial_expired';
        }
        const billable = displayStatus === 'active';

        return {
          id,
          name: community.name || 'Unnamed Community',
          websiteMap: {
            status: rawStatus,
            displayStatus,
            trialEndsAt: community.websiteMap?.trialEndsAt || null,
            trialEndsAtFormatted: trialCountdown.trialEndsAtFormatted,
            trialEndsInDays: hasActiveTrial ? trialCountdown.trialEndsInDays : null,
            trialExpired,
            billable,
            pendingEnable,
            pendingCancel,
            setupFeeApplied: !!community.websiteMap?.setupFeeApplied
          }
        };
      });

      const websiteMapPendingEnable = websiteMapEnableSet.size > 0;
      const websiteMapPendingCancel = websiteMapCancelAll || websiteMapCancelSet.size > 0;
      const websiteMapHasActive = communityPayload.some((community) =>
        ['active', 'trial'].includes(community.websiteMap?.displayStatus)
      );
      const websiteMapDisplayStatus = websiteMapPendingCancel
        ? 'pending_cancel'
        : websiteMapPendingEnable
          ? 'pending_enable'
          : websiteMapHasActive || websiteMapFeature.enabled
            ? 'active'
            : 'inactive';

      const billingPolicy = company.billingPolicy || {};
      const estimated = computeEstimatedMonthlySummary({
        seatCounts,
        entitlements: company.entitlements || {},
        communities: communityPayload,
        buildrootzStatus: buildrootzStatusRaw,
        billingPolicy
      });
      const hasPolicyAdjustments = (
        (billingPolicy.seats?.mode && billingPolicy.seats.mode !== 'normal')
        || (billingPolicy.seats?.minBilledOverride !== null && billingPolicy.seats?.minBilledOverride !== undefined)
        || billingPolicy.addons?.buildrootz === 'comped'
        || billingPolicy.addons?.websiteMap === 'comped'
      );

      return res.json({
        companyId: String(companyId),
        serverTime: new Date().toISOString(),
        seatBilling: {
          used: estimated.seats.used,
          minimum: estimated.seats.minimum,
          billed: estimated.seats.billed,
          monthlyCents: estimated.seats.monthlyCents,
          monthlyFormatted: estimated.seats.monthlyFormatted
        },
        seats: {
          used: seatCounts.active,
          invited: seatCounts.invited,
          minimumBilled: estimated.seats.minimum,
          billed: estimated.seats.billed
        },
        pricing: pricingConfig,
        pricingDisplay: {
          seats: {
            minBilled: pricingConfig.seats.minBilled,
            pricePerSeatMonthlyCents: pricingConfig.seats.pricePerSeatMonthlyCents,
            pricePerSeatMonthlyFormatted: formatCents(pricingConfig.seats.pricePerSeatMonthlyCents)
          },
          buildrootz: {
            monthlyCents: pricingConfig.buildrootz.monthlyCents,
            monthlyFormatted: formatCents(pricingConfig.buildrootz.monthlyCents)
          },
          websiteMap: {
            monthlyCents: pricingConfig.websiteMap.monthlyCents,
            monthlyFormatted: formatCents(pricingConfig.websiteMap.monthlyCents),
            annualCents: pricingConfig.websiteMap.annualCents,
            annualFormatted: formatCents(pricingConfig.websiteMap.annualCents),
            setupFeeCents: pricingConfig.websiteMap.setupFeeCents,
            setupFeeFormatted: formatCents(pricingConfig.websiteMap.setupFeeCents),
            defaultTrialDays: pricingConfig.websiteMap.defaultTrialDays
          }
        },
        estimated: {
          lineItems: estimated.lineItems,
          totalMonthlyCents: estimated.totalMonthlyCents,
          totalMonthlyFormatted: estimated.totalMonthlyFormatted
        },
        features: {
          buildrootz: {
            enabled: !!buildrootzFeature.enabled,
            status: buildrootzStatusRaw,
            displayStatus: buildrootzDisplayStatus,
            pendingEnable: pendingBuildrootzEnable,
            pendingCancel: pendingBuildrootzCancel
          },
          websiteMap: {
            enabled: !!websiteMapFeature.enabled,
            displayStatus: websiteMapDisplayStatus,
            pendingEnable: websiteMapPendingEnable,
            pendingCancel: websiteMapPendingCancel
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
        billingPolicy: {
          seats: {
            mode: billingPolicy.seats?.mode || 'normal',
            minBilledOverride:
              billingPolicy.seats?.minBilledOverride === null || billingPolicy.seats?.minBilledOverride === undefined
                ? null
                : Number(billingPolicy.seats.minBilledOverride)
          },
          addons: {
            buildrootz: billingPolicy.addons?.buildrootz || 'normal',
            websiteMap: billingPolicy.addons?.websiteMap || 'normal'
          },
          hasOverrides: hasPolicyAdjustments
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
      const { feature, communityId, companyId: rawCompanyId, action } = req.body || {};
      const normalizedFeature = normalizeFeature(feature);
      if (!['buildrootz', 'websiteMap'].includes(normalizedFeature)) {
        return res.status(400).json({ error: 'Invalid feature.' });
      }
      const normalizedAction = action ? String(action).trim().toLowerCase() : 'enable';
      if (!['enable', 'cancel'].includes(normalizedAction)) {
        return res.status(400).json({ error: 'Invalid action.' });
      }

      const companyId = resolveCompanyId(req, rawCompanyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      let community = null;
      let communityObjectId = null;
      if (normalizedFeature === 'websiteMap' && communityId) {
        if (!isObjectId(communityId)) {
          return res.status(400).json({ error: 'Valid communityId is required.' });
        }
        communityObjectId = new mongoose.Types.ObjectId(communityId);
        community = await Community.findOne({ _id: communityObjectId, company: companyId });
        if (!community) {
          return res.status(404).json({ error: 'Community not found.' });
        }
      }
      if (normalizedFeature === 'websiteMap' && normalizedAction === 'enable' && !communityObjectId) {
        return res.status(400).json({ error: 'Community is required for Website Map activation.' });
      }

      const existing = await FeatureRequest.findOne({
        companyId,
        feature: normalizedFeature,
        communityId: communityObjectId,
        status: 'pending',
        action: normalizedAction
      }).select('_id');
      if (existing) {
        return res.json({ requestId: String(existing._id), status: 'pending' });
      }

      const request = await FeatureRequest.create({
        companyId,
        feature: normalizedFeature,
        communityId: communityObjectId,
        status: 'pending',
        action: normalizedAction,
        createdByUserId: req.user?._id || null
      });

      if (normalizedFeature === 'buildrootz' && normalizedAction === 'enable') {
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
        status: 'pending',
        action: 'enable'
      }).select('_id');
      if (pendingRequest) {
        return res.status(400).json({ error: 'Activation request is already pending.' });
      }

      const company = await Company.findById(companyId).select('entitlements features');
      const trialOverride = company?.entitlements?.websiteMap?.trialDaysOverride;
      const defaultTrialDays = pricingConfig.websiteMap?.defaultTrialDays || 30;
      const trialDays = Number.isFinite(trialOverride) && trialOverride > 0 ? trialOverride : defaultTrialDays;
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
