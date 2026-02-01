const express = require('express');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const Company = require('../../models/Company');
const Community = require('../../models/Community');
const FeatureRequest = require('../../models/FeatureRequest');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');
const { getSeatCounts } = require('../../utils/seatCounts');
const { pricingConfig } = require('../../config/pricingConfig');
const { computeSeatBilling, isTrialExpired, getTrialCountdown } = require('../../utils/billingMath');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePolicySnapshot = (policy) => {
  const seats = policy?.seats || {};
  const addons = policy?.addons || {};
  return {
    seats: {
      mode: seats.mode || 'normal',
      minBilledOverride:
        seats.minBilledOverride === null || seats.minBilledOverride === undefined
          ? null
          : Number(seats.minBilledOverride)
    },
    addons: {
      buildrootz: addons.buildrootz || 'normal',
      websiteMap: addons.websiteMap || 'normal'
    },
    notes: policy?.notes || ''
  };
};

const summarizePolicyChange = (before, after, metadata) => {
  if (metadata?.presetName) {
    return `Preset applied: ${metadata.presetName}`;
  }
  const changes = [];
  if (before.seats?.mode !== after.seats?.mode) {
    changes.push(`Seats mode: ${after.seats?.mode || 'normal'}`);
  }
  if (before.seats?.minBilledOverride !== after.seats?.minBilledOverride) {
    const value = after.seats?.minBilledOverride;
    changes.push(`Min seats: ${value === null ? 'default' : value}`);
  }
  if (before.addons?.buildrootz !== after.addons?.buildrootz) {
    changes.push(`BuildRootz: ${after.addons?.buildrootz || 'normal'}`);
  }
  if (before.addons?.websiteMap !== after.addons?.websiteMap) {
    changes.push(`Website Map: ${after.addons?.websiteMap || 'normal'}`);
  }
  if (!changes.length) {
    return 'Billing policy updated';
  }
  return changes.join('; ');
};

router.use(requireRole('SUPER_ADMIN', 'KEEPUP_ADMIN'));

const serializeCompanyListItem = async (company, pendingByCompany, mapCountsByCompany) => {
  const seatCounts = await getSeatCounts(company._id);
  const minOverride = company.billingPolicy?.seats?.minBilledOverride ?? null;
  const seatBilling = computeSeatBilling(seatCounts.active, minOverride);
  const buildrootzFeature = company.features?.buildrootz || {};
  const buildrootzStatus = buildrootzFeature.status || (buildrootzFeature.enabled ? 'active' : 'inactive');
  const pending = pendingByCompany.get(String(company._id)) || {
    buildrootzEnable: false,
    buildrootzCancel: false,
    websiteMapEnable: false,
    websiteMapCancel: false
  };
  const mapsActiveCount = mapCountsByCompany.get(String(company._id)) || 0;
  const buildrootzDisplayStatus = pending.buildrootzCancel || pending.buildrootzEnable
    ? 'pending'
    : ['active', 'trial'].includes(buildrootzStatus)
      ? 'active'
      : buildrootzStatus === 'pending'
        ? 'pending'
        : 'inactive';
  const websiteMapDisplayStatus = pending.websiteMapCancel || pending.websiteMapEnable
    ? 'pending'
    : mapsActiveCount > 0 || company.features?.websiteMap?.enabled
      ? 'active'
      : 'inactive';

  return {
    id: String(company._id),
    name: company.name || 'Unnamed Company',
    seatsUsed: seatCounts.active,
    seatsInvited: seatCounts.invited,
    seatsBilled: seatBilling.billed,
    seatsMinimum: seatBilling.minimum,
    buildrootzStatus,
    buildrootzDisplayStatus,
    websiteMapDisplayStatus,
    websiteMapEnabled: !!company.features?.websiteMap?.enabled,
    mapsActiveCount,
    updatedAt: company.updatedAt
  };
};

router.get('/companies', async (req, res, next) => {
  try {
    const search = (req.query.q || '').toString().trim();
    const filter = search
      ? { name: { $regex: escapeRegex(search), $options: 'i' } }
      : {};

    const companies = await Company.find(filter)
      .select('name billing billingPolicy features updatedAt')
      .sort({ name: 1 })
      .limit(200)
      .lean();

    const companyIds = companies.map((company) => company._id);
    const [pendingRequests, communities] = await Promise.all([
      FeatureRequest.find({
        companyId: { $in: companyIds },
        status: 'pending',
        feature: { $in: ['buildrootz', 'websiteMap'] }
      })
        .select('companyId feature action communityId')
        .lean(),
      Community.find({ company: { $in: companyIds } })
        .select('company websiteMap.status websiteMap.trialEndsAt')
        .lean()
    ]);

    const pendingByCompany = new Map();
    for (const request of pendingRequests) {
      const key = String(request.companyId);
      if (!pendingByCompany.has(key)) {
        pendingByCompany.set(key, {
          buildrootzEnable: false,
          buildrootzCancel: false,
          websiteMapEnable: false,
          websiteMapCancel: false
        });
      }
      const entry = pendingByCompany.get(key);
      const action = request.action || 'enable';
      if (request.feature === 'buildrootz') {
        if (action === 'cancel') {
          entry.buildrootzCancel = true;
        } else {
          entry.buildrootzEnable = true;
        }
      }
      if (request.feature === 'websiteMap') {
        if (action === 'cancel') {
          entry.websiteMapCancel = true;
        } else {
          entry.websiteMapEnable = true;
        }
      }
    }

    const mapCountsByCompany = new Map();
    const now = new Date();
    for (const community of communities) {
      const companyId = String(community.company);
      const rawStatus = community.websiteMap?.status || 'inactive';
      if (rawStatus !== 'active') continue;
      mapCountsByCompany.set(companyId, (mapCountsByCompany.get(companyId) || 0) + 1);
    }

    const items = [];
    for (const company of companies) {
      items.push(await serializeCompanyListItem(company, pendingByCompany, mapCountsByCompany));
    }

    return res.json({ companies: items });
  } catch (err) {
    next(err);
  }
});

router.get('/company/:companyId', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company id.' });
    }

    const company = await Company.findById(companyId).lean();
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    const [seatCounts, communities] = await Promise.all([
      getSeatCounts(companyId),
      Community.find({ company: companyId })
        .select('name websiteMap updatedAt')
        .sort({ name: 1 })
        .lean()
    ]);

    const seatBilling = computeSeatBilling(seatCounts.active, company.billingPolicy?.seats?.minBilledOverride ?? null);
    const trialDaysOverride = company.entitlements?.websiteMap?.trialDaysOverride;
    const defaultTrialDays = pricingConfig.websiteMap?.defaultTrialDays || 30;
    const trialDays = Number.isFinite(trialDaysOverride) && trialDaysOverride > 0 ? trialDaysOverride : defaultTrialDays;
    const freeSetups = Number(company.entitlements?.websiteMap?.freeCommunitySetups || 0);

    const activeWebsiteMaps = communities.filter((community) =>
      ['active', 'trial'].includes(community.websiteMap?.status)
    ).length;
    const freeSetupsRemaining = Math.max(0, freeSetups - activeWebsiteMaps);

  return res.json({
      company: {
        id: String(company._id),
        name: company.name || '',
        address: company.address || {},
        primaryContact: company.primaryContact || {},
        billing: company.billing || {},
        billingPolicy: company.billingPolicy || {},
        features: company.features || {},
        entitlements: company.entitlements || {},
        updatedAt: company.updatedAt
      },
      seats: {
        used: seatCounts.active,
        invited: seatCounts.invited,
        minimumBilled: seatBilling.minimum,
        billed: seatBilling.billed,
        monthlyCents: seatBilling.monthlyCents,
        monthlyFormatted: seatBilling.monthlyFormatted
      },
      websiteMapSummary: {
        freeCommunitySetups: freeSetups,
        freeCommunitySetupsRemaining: freeSetupsRemaining,
        trialDays
      },
      communities: (() => {
        const now = new Date();
        return communities.map((community) => {
          const rawStatus = community.websiteMap?.status || 'inactive';
          const trialExpired = isTrialExpired(community.websiteMap, now);
          const trialCountdown = getTrialCountdown(community.websiteMap?.trialEndsAt, now);
          const hasActiveTrial = rawStatus === 'trial' && !trialExpired;
          const displayStatus = rawStatus === 'trial' && trialExpired ? 'trial_expired' : rawStatus;
          const billable = displayStatus === 'active';

          return {
            id: String(community._id),
            name: community.name || 'Unnamed Community',
            websiteMap: {
              status: rawStatus,
              displayStatus,
              trialEndsAt: community.websiteMap?.trialEndsAt || null,
              trialEndsAtFormatted: trialCountdown.trialEndsAtFormatted,
              trialEndsInDays: hasActiveTrial ? trialCountdown.trialEndsInDays : null,
              trialExpired,
              billable
            },
            updatedAt: community.updatedAt
          };
        });
      })()
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/company/:companyId/policy', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company id.' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    const beforePolicy = normalizePolicySnapshot(company.billingPolicy || {});
    const {
      seatsMode,
      minBilledOverride,
      buildrootzBilling,
      websiteMapBilling,
      notes,
      presetName
    } = req.body || {};

    const allowedSeatModes = new Set(['normal', 'waived', 'internal']);
    const allowedAddonModes = new Set(['normal', 'comped']);

    company.billingPolicy = company.billingPolicy || {};
    company.billingPolicy.seats = company.billingPolicy.seats || {};
    company.billingPolicy.addons = company.billingPolicy.addons || {};

    if (seatsMode) {
      const normalized = String(seatsMode).trim().toLowerCase();
      if (!allowedSeatModes.has(normalized)) {
        return res.status(400).json({ error: 'Invalid seats mode.' });
      }
      company.billingPolicy.seats.mode = normalized;
    }

    if (minBilledOverride !== undefined) {
      if (minBilledOverride === null || minBilledOverride === '') {
        company.billingPolicy.seats.minBilledOverride = null;
      } else {
        const value = Number(minBilledOverride);
        if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 999) {
          return res.status(400).json({ error: 'Minimum billed override must be an integer between 0 and 999.' });
        }
        company.billingPolicy.seats.minBilledOverride = value;
      }
    }

    if (buildrootzBilling) {
      const normalized = String(buildrootzBilling).trim().toLowerCase();
      if (!allowedAddonModes.has(normalized)) {
        return res.status(400).json({ error: 'Invalid BuildRootz billing mode.' });
      }
      company.billingPolicy.addons.buildrootz = normalized;
    }

    if (websiteMapBilling) {
      const normalized = String(websiteMapBilling).trim().toLowerCase();
      if (!allowedAddonModes.has(normalized)) {
        return res.status(400).json({ error: 'Invalid Website Map billing mode.' });
      }
      company.billingPolicy.addons.websiteMap = normalized;
    }

    if (notes !== undefined) {
      company.billingPolicy.notes = String(notes || '').trim();
    }

    company.updatedByUserId = req.user?._id || null;
    company.markModified('billingPolicy');
    await company.save();

    const afterPolicy = normalizePolicySnapshot(company.billingPolicy || {});
    await AuditLog.create({
      companyId: company._id,
      actorUserId: req.user?._id || null,
      action: 'billing_policy_updated',
      before: beforePolicy,
      after: afterPolicy,
      metadata: presetName ? { presetName: String(presetName) } : null
    });

    return res.json({ billingPolicy: company.billingPolicy });
  } catch (err) {
    next(err);
  }
});

router.get('/company/:companyId/audit', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company id.' });
    }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;

    const logs = await AuditLog.find({ companyId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const actorIds = Array.from(new Set(logs.map((log) => String(log.actorUserId || '')).filter(isObjectId)));
    const users = await User.find({ _id: { $in: actorIds } })
      .select('email firstName lastName')
      .lean();
    const userLookup = new Map(users.map((user) => [String(user._id), user]));

    const payload = logs.map((log) => {
      const user = log.actorUserId ? userLookup.get(String(log.actorUserId)) || null : null;
      const actorName = user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
        : '';
      const before = normalizePolicySnapshot(log.before || {});
      const after = normalizePolicySnapshot(log.after || {});
      const metadata = log.metadata || null;
      return {
        id: String(log._id),
        createdAt: log.createdAt,
        actorName,
        actorEmail: user?.email || '',
        summary: summarizePolicyChange(before, after, metadata),
        metadata
      };
    });

    return res.json({ audits: payload });
  } catch (err) {
    next(err);
  }
});

router.patch('/company/:companyId/features', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company id.' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    const { buildrootzEnabled, buildrootzStatus, websiteMapEnabled } = req.body || {};
    const statusValue = buildrootzStatus ? normalizeStatus(buildrootzStatus) : null;
    const allowedStatuses = new Set(['inactive', 'pending', 'trial', 'active']);
    if (statusValue && !allowedStatuses.has(statusValue)) {
      return res.status(400).json({ error: 'Invalid Buildrootz status.' });
    }

    company.features = company.features || {};
    company.features.buildrootz = company.features.buildrootz || {};
    company.features.websiteMap = company.features.websiteMap || {};

    if (typeof buildrootzEnabled === 'boolean') {
      company.features.buildrootz.enabled = buildrootzEnabled;
    }
    if (statusValue) {
      company.features.buildrootz.status = statusValue;
      if (statusValue === 'active') {
        company.features.buildrootz.enabled = true;
      }
      if (statusValue === 'inactive') {
        company.features.buildrootz.enabled = false;
      }
    }
    if (typeof websiteMapEnabled === 'boolean') {
      company.features.websiteMap.enabled = websiteMapEnabled;
    }

    company.updatedByUserId = req.user?._id || null;
    company.markModified('features');
    await company.save();

    return res.json({
      buildrootz: company.features.buildrootz,
      websiteMap: company.features.websiteMap
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/community/:communityId/website-map', async (req, res, next) => {
  try {
    const { communityId } = req.params;
    if (!isObjectId(communityId)) {
      return res.status(400).json({ error: 'Invalid community id.' });
    }

    const status = normalizeStatus(req.body?.status);
    if (!['inactive', 'trial', 'active'].includes(status)) {
      return res.status(400).json({ error: 'Invalid website map status.' });
    }

    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: 'Community not found.' });
    }

    const company = await Company.findById(community.company);
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    const trialOverride = company.entitlements?.websiteMap?.trialDaysOverride;
    const defaultTrialDays = pricingConfig.websiteMap?.defaultTrialDays || 30;
    const trialDays = Number.isFinite(trialOverride) && trialOverride > 0 ? trialOverride : defaultTrialDays;

    community.websiteMap = community.websiteMap || {};
    community.websiteMap.status = status;
    if (status === 'trial') {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
      community.websiteMap.trialEndsAt = trialEndsAt;
      company.features = company.features || {};
      company.features.websiteMap = company.features.websiteMap || {};
      company.features.websiteMap.enabled = true;
      company.markModified('features');
    }
    if (status === 'active') {
      company.features = company.features || {};
      company.features.websiteMap = company.features.websiteMap || {};
      company.features.websiteMap.enabled = true;
      company.markModified('features');
    }
    if (status === 'inactive') {
      community.websiteMap.trialEndsAt = null;
    }

    community.updatedByUserId = req.user?._id || null;
    company.updatedByUserId = req.user?._id || null;
    community.markModified('websiteMap');
    await Promise.all([community.save(), company.save()]);

    return res.json({
      communityId: String(community._id),
      status: community.websiteMap.status,
      trialEndsAt: community.websiteMap.trialEndsAt
    });
  } catch (err) {
    next(err);
  }
});

router.get('/requests', async (req, res, next) => {
  try {
    const status = normalizeStatus(req.query.status || 'pending');
    const allowedStatuses = new Set(['pending', 'approved', 'denied']);
    const filterStatus = allowedStatuses.has(status) ? status : 'pending';

    const requests = await FeatureRequest.find({ status: filterStatus })
      .sort({ createdAt: -1 })
      .lean();

    const companyIds = Array.from(new Set(requests.map((request) => String(request.companyId || '')))).filter(isObjectId);
    const communityIds = Array.from(new Set(requests.map((request) => String(request.communityId || '')))).filter(isObjectId);
    const userIds = Array.from(new Set(requests.map((request) => String(request.createdByUserId || '')))).filter(isObjectId);

    const [companies, communities, users] = await Promise.all([
      Company.find({ _id: { $in: companyIds } }).select('name').lean(),
      Community.find({ _id: { $in: communityIds } }).select('name company').lean(),
      User.find({ _id: { $in: userIds } }).select('email firstName lastName').lean()
    ]);

    const companyLookup = new Map(companies.map((company) => [String(company._id), company]));
    const communityLookup = new Map(communities.map((community) => [String(community._id), community]));
    const userLookup = new Map(users.map((user) => [String(user._id), user]));

    const payload = requests.map((request) => {
      const company = companyLookup.get(String(request.companyId)) || {};
      const community = request.communityId ? communityLookup.get(String(request.communityId)) || {} : null;
      const user = request.createdByUserId ? userLookup.get(String(request.createdByUserId)) || {} : null;
      const requestedBy = user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
        : '';

      return {
        id: String(request._id),
        companyId: String(request.companyId),
        companyName: company.name || 'Unknown Company',
        feature: request.feature,
        action: request.action || 'enable',
        communityId: request.communityId ? String(request.communityId) : null,
        communityName: community?.name || null,
        status: request.status,
        createdAt: request.createdAt,
        requestedBy
      };
    });

    return res.json({ requests: payload });
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:requestId/approve', async (req, res, next) => {
  try {
    const { requestId } = req.params;
    if (!isObjectId(requestId)) {
      return res.status(400).json({ error: 'Invalid request id.' });
    }

    const request = await FeatureRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    if (request.status !== 'pending') {
      return res.json({ ok: true });
    }

    const action = request.action || 'enable';

    if (request.feature === 'buildrootz' && action === 'enable') {
      const company = await Company.findById(request.companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found.' });
      }
      company.features = company.features || {};
      company.features.buildrootz = company.features.buildrootz || {};
      company.features.buildrootz.status = 'active';
      company.features.buildrootz.enabled = true;
      company.updatedByUserId = req.user?._id || null;
      company.markModified('features');
      await company.save();
    }

    if (request.feature === 'buildrootz' && action === 'cancel') {
      const company = await Company.findById(request.companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found.' });
      }
      company.features = company.features || {};
      company.features.buildrootz = company.features.buildrootz || {};
      company.features.buildrootz.status = 'inactive';
      company.features.buildrootz.enabled = false;
      company.updatedByUserId = req.user?._id || null;
      company.markModified('features');
      await company.save();
    }

    if (request.feature === 'websiteMap' && action === 'enable') {
      if (!request.communityId) {
        return res.status(400).json({ error: 'Community is required for Website Map.' });
      }
      const community = await Community.findById(request.communityId);
      if (!community) {
        return res.status(404).json({ error: 'Community not found.' });
      }
      if (String(community.company) !== String(request.companyId)) {
        return res.status(400).json({ error: 'Community does not belong to request company.' });
      }
      const company = await Company.findById(community.company);
      if (!company) {
        return res.status(404).json({ error: 'Company not found.' });
      }
      community.websiteMap = community.websiteMap || {};
      community.websiteMap.status = 'active';
      community.updatedByUserId = req.user?._id || null;
      community.markModified('websiteMap');
      await community.save();

      company.features = company.features || {};
      company.features.websiteMap = company.features.websiteMap || {};
      company.features.websiteMap.enabled = true;
      company.updatedByUserId = req.user?._id || null;
      company.markModified('features');
      await company.save();
    }

    if (request.feature === 'websiteMap' && action === 'cancel') {
      const company = await Company.findById(request.companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found.' });
      }

      if (request.communityId) {
        const community = await Community.findById(request.communityId);
        if (community && String(community.company) === String(company._id)) {
          community.websiteMap = community.websiteMap || {};
          community.websiteMap.status = 'inactive';
          community.websiteMap.trialEndsAt = null;
          community.updatedByUserId = req.user?._id || null;
          community.markModified('websiteMap');
          await community.save();
        } else if (community) {
          return res.status(400).json({ error: 'Community does not belong to request company.' });
        }
      } else {
        await Community.updateMany(
          { company: company._id },
          {
            $set: {
              'websiteMap.status': 'inactive',
              'websiteMap.trialEndsAt': null,
              updatedByUserId: req.user?._id || null
            }
          }
        );
        company.features = company.features || {};
        company.features.websiteMap = company.features.websiteMap || {};
        company.features.websiteMap.enabled = false;
        company.updatedByUserId = req.user?._id || null;
        company.markModified('features');
        await company.save();
      }
    }

    request.status = 'approved';
    request.approvedAt = new Date();
    request.approvedByUserId = req.user?._id || null;
    await request.save();

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/requests/:requestId/deny', async (req, res, next) => {
  try {
    const { requestId } = req.params;
    if (!isObjectId(requestId)) {
      return res.status(400).json({ error: 'Invalid request id.' });
    }

    const request = await FeatureRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    if (request.status !== 'pending') {
      return res.json({ ok: true });
    }

    request.status = 'denied';
    request.deniedAt = new Date();
    request.deniedByUserId = req.user?._id || null;
    await request.save();

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/company/:companyId/website-map/cancel-all', async (req, res, next) => {
  try {
    const { companyId } = req.params;
    if (!isObjectId(companyId)) {
      return res.status(400).json({ error: 'Invalid company id.' });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    await Community.updateMany(
      { company: company._id },
      {
        $set: {
          'websiteMap.status': 'inactive',
          'websiteMap.trialEndsAt': null,
          updatedByUserId: req.user?._id || null
        }
      }
    );

    company.features = company.features || {};
    company.features.websiteMap = company.features.websiteMap || {};
    company.features.websiteMap.enabled = false;
    company.updatedByUserId = req.user?._id || null;
    company.markModified('features');
    await company.save();

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
