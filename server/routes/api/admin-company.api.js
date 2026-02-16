const express = require('express');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const Company = require('../../models/Company');
const CompanyEmailDomain = require('../../models/CompanyEmailDomain');
const EmailJob = require('../../models/EmailJob');
const EmailEvent = require('../../models/EmailEvent');
const { formatPhoneForDisplay, formatPhoneForStorage } = require('../../utils/phone');
const {
  createDomainAuth,
  validateDomainAuth,
  normalizeDomain,
  normalizeSubdomain,
  normalizeDnsRecords
} = require('../../services/email/sendgridDomainAuth');
const { getCompanyDayBounds } = require('../../services/email/companyTimeWindow');
const { getSentCountToday, DEFAULT_DAILY_CAP, getEffectiveDailyCap } = require('../../services/email/companyDailyCap');
const { computeWarmupState, buildWarmupUpdate, buildWarmupStartState } = require('../../services/email/emailWarmup');
const AuditLog = require('../../models/AuditLog');
const { computeDeliverabilityHealth } = require('../../services/email/deliverabilityHealth');
const { getBlockedEmailJobsReport } = require('../../services/email/emailJobDebug');
const { getEmailReadiness } = require('../../services/email/emailReadiness');
const { getEmailSystemCheck } = require('../../services/email/emailSystemCheck');
const { buildUnsubscribeUrl } = require('../../services/email/unsubscribeToken');
const { appendUnsubscribeFooter } = require('../../services/email/unsubscribeFooter');

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

const resolveCompanyId = (req, companyIdParam) => {
  if (isSuper(req) && isObjectId(companyIdParam)) return new mongoose.Types.ObjectId(companyIdParam);
  if (isObjectId(req.user?.company)) return new mongoose.Types.ObjectId(req.user.company);
  return null;
};

const serializeEmailDomain = (doc) => {
  if (!doc) {
    return {
      status: CompanyEmailDomain.STATUS.NOT_STARTED,
      domain: '',
      subdomain: 'email',
      linkBranding: true,
      sendgridDomainId: null,
      dnsRecords: [],
      lastValidation: null,
      verifiedAt: null,
      lastValidatedAt: null
    };
  }
  const dnsRecords = Array.isArray(doc.dnsRecords)
    ? doc.dnsRecords.map((record) => ({
      type: record.type || '',
      host: record.host || '',
      value: record.value || record.data || '',
      purpose: record.purpose || ''
    }))
    : [];
  return {
    id: String(doc._id),
    companyId: String(doc.companyId),
    domain: doc.domain || '',
    subdomain: doc.subdomain || 'email',
    linkBranding: doc.linkBranding !== false,
    sendgridDomainId: doc.sendgridDomainId || null,
    status: doc.status || CompanyEmailDomain.STATUS.NOT_STARTED,
    dnsRecords,
    lastValidation: doc.lastValidation || null,
    verifiedAt: doc.verifiedAt || null,
    lastValidatedAt: doc.lastValidatedAt || doc.lastValidation?.checkedAt || null,
    updatedAt: doc.updatedAt || null,
    createdAt: doc.createdAt || null
  };
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
  notes: company.notes || '',
  emailDailyCapEnabled: company.emailDailyCapEnabled !== false,
  emailDailyCap: Number.isFinite(company.emailDailyCap) ? company.emailDailyCap : 500,
  emailSendingPaused: Boolean(company.emailSendingPaused),
  emailSendingPausedAt: company.emailSendingPausedAt || null,
  emailSendingPausedBy: company.emailSendingPausedBy || null,
  emailSendingPausedReason: company.emailSendingPausedReason || null,
  emailSendingPausedMeta: company.emailSendingPausedMeta || null,
  emailAutoPauseOnSpamReport: company.emailAutoPauseOnSpamReport !== false,
  emailAutoPauseOnBounceRate: company.emailAutoPauseOnBounceRate !== false,
  emailBounceRateThreshold: Number.isFinite(company.emailBounceRateThreshold)
    ? company.emailBounceRateThreshold
    : 0.05,
  emailBounceMinSentForEvaluation: Number.isFinite(company.emailBounceMinSentForEvaluation)
    ? company.emailBounceMinSentForEvaluation
    : 50
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

router.get(
  '/:companyId/email-domain',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const doc = await CompanyEmailDomain.findOne({ companyId }).lean();
      return res.json(serializeEmailDomain(doc));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:companyId/email-deliverability',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const company = await Company.findById(companyId)
        .select(
          [
            'settings.timezone',
            'emailDailyCapEnabled',
            'emailDailyCap',
            'emailDomainVerifiedAt',
            'emailWarmup',
            'emailSendingPaused',
            'emailSendingPausedAt',
            'emailSendingPausedBy',
            'emailSendingPausedReason',
            'emailSendingPausedMeta'
          ].join(' ')
        )
        .lean();
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const now = new Date();
      const domainDoc = await CompanyEmailDomain.findOne({ companyId })
        .select('status domain')
        .lean();
      const bounds = getCompanyDayBounds(company, now);
      const sentToday = await getSentCountToday(companyId, bounds.start, bounds.end);
      const eventTimeFilter = {
        $or: [
          { eventAt: { $gte: bounds.start, $lt: bounds.end } },
          { eventAt: null, createdAt: { $gte: bounds.start, $lt: bounds.end } },
          { eventAt: { $exists: false }, createdAt: { $gte: bounds.start, $lt: bounds.end } }
        ]
      };

      const [bouncesToday, spamreportsToday] = await Promise.all([
        EmailEvent.countDocuments({
          companyId,
          event: 'bounce',
          ...eventTimeFilter
        }),
        EmailEvent.countDocuments({
          companyId,
          event: 'spamreport',
          ...eventTimeFilter
        })
      ]);

      const warmupState = computeWarmupState({ company, now });
      const warmupUpdate = buildWarmupUpdate(company?.emailWarmup, warmupState);
      if (warmupUpdate) {
        await Company.updateOne({ _id: companyId }, { $set: warmupUpdate });
      }

      const capConfig = getEffectiveDailyCap({ company, now });
      const capEnabled = capConfig.enabled;
      const baseCap = Number.isFinite(capConfig.baseCap) ? capConfig.baseCap : DEFAULT_DAILY_CAP;
      const effectiveCap = Number.isFinite(capConfig.effectiveCap) ? capConfig.effectiveCap : baseCap;
      const remaining = capEnabled ? Math.max(0, effectiveCap - sentToday) : null;
      const capReached = capEnabled && effectiveCap > 0 && sentToday >= effectiveCap;

      const domainConfigured = Boolean(domainDoc?.domain);
      const domainVerified = domainDoc?.status === CompanyEmailDomain.STATUS.VERIFIED;

      const health = computeDeliverabilityHealth({
        company,
        warmup: warmupState,
        capReached,
        domainConfigured,
        domainVerified
      });

      const emailReadiness = await getEmailReadiness({ company });

      return res.json({
        companyId: String(companyId),
        timezone: bounds.timeZone,
        now,
        day: {
          start: bounds.start,
          end: bounds.end,
          resetAt: bounds.startOfNextDay
        },
        domain: {
          status: domainDoc?.status || CompanyEmailDomain.STATUS.NOT_STARTED,
          name: domainDoc?.domain || ''
        },
        sendingPaused: {
          paused: Boolean(company.emailSendingPaused),
          reason: company.emailSendingPausedReason || null,
          pausedAt: company.emailSendingPausedAt || null,
          pausedBy: company.emailSendingPausedBy || null,
          meta: company.emailSendingPausedMeta || null
        },
        dailyCap: {
          enabled: capEnabled,
          baseCap,
          effectiveCap,
          cap: effectiveCap,
          sentToday,
          remaining
        },
        warmup: warmupState,
        health,
        emailReadiness,
        eventsToday: {
          bounces: bouncesToday,
          spamreports: spamreportsToday
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:companyId/email-jobs/blocked',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const limitRaw = Number(req.query?.limit || 25);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 25;
      const report = await getBlockedEmailJobsReport({ companyId, limit });

      return res.json({
        companyId: String(companyId),
        ...report
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:companyId/email-system-check',
  requireRole('MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const company = await Company.findById(companyId)
        .select('emailSendingPaused emailSendingPausedReason emailSendingPausedAt')
        .lean();
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const check = await getEmailSystemCheck({ company });
      return res.json({
        companyId: String(companyId),
        ...check
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:companyId/email-tools/footer-preview',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const email = trimToNull(req.query?.email) || 'test@example.com';
      const unsubscribeUrl = buildUnsubscribeUrl({ companyId, email });
      if (!unsubscribeUrl) {
        return res.status(400).json({ error: 'Unsubscribe config missing.' });
      }

      const baseHtml = '<p>Preview email body.</p>';
      const baseText = 'Preview email body.';
      const preview = appendUnsubscribeFooter({
        html: baseHtml,
        text: baseText,
        unsubscribeUrl
      });

      return res.json({
        html: preview.html,
        text: preview.text,
        unsubscribeUrl
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/:companyId/email-tools/test-unsubscribe',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const email = trimToNull(req.query?.email) || 'test@example.com';
      const unsubscribeUrl = buildUnsubscribeUrl({ companyId, email });
      if (!unsubscribeUrl) {
        return res.status(400).json({ error: 'Unsubscribe config missing.' });
      }

      return res.json({ unsubscribeUrl });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:companyId/email-domain/start',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const { domain: rawDomain, subdomain: rawSubdomain, linkBranding } = req.body || {};
      const domainResult = normalizeDomain(rawDomain);
      if (domainResult.error) {
        return res.status(400).json({ error: domainResult.error });
      }
      let subdomainInput = rawSubdomain;
      if (typeof subdomainInput === 'string') {
        const trimmed = subdomainInput.trim().toLowerCase().replace(/^@/, '');
        if (trimmed.includes('.') && domainResult.domain && trimmed.endsWith(`.${domainResult.domain}`)) {
          subdomainInput = trimmed.slice(0, -(domainResult.domain.length + 1));
        }
      }
      const subdomainResult = normalizeSubdomain(subdomainInput, 'email');
      if (subdomainResult.error) {
        return res.status(400).json({ error: subdomainResult.error });
      }

      let response;
      try {
        response = await createDomainAuth({
          domain: domainResult.domain,
          subdomain: subdomainResult.subdomain,
          linkBranding: Boolean(linkBranding)
        });
      } catch (err) {
        console.error('[sendgrid domain] start failed', err?.response?.body || err);
        throw err;
      }

      const dnsRecords = normalizeDnsRecords(response);
      const sendgridDomainId = response?.id != null ? String(response.id) : null;
      if (!sendgridDomainId) {
        return res.status(502).json({ error: 'SendGrid did not return a domain id.' });
      }

      const doc = await CompanyEmailDomain.findOneAndUpdate(
        { companyId },
        {
          $set: {
            domain: domainResult.domain,
            subdomain: subdomainResult.subdomain,
            linkBranding: Boolean(linkBranding),
            sendgridDomainId,
            dnsRecords,
            status: CompanyEmailDomain.STATUS.PENDING,
            lastValidation: { valid: null, results: {}, checkedAt: null },
            verifiedAt: null,
            lastValidatedAt: null
          }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();

      return res.json(serializeEmailDomain(doc));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:companyId/email-domain/validate',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const doc = await CompanyEmailDomain.findOne({ companyId });
      if (!doc?.sendgridDomainId) {
        return res.status(400).json({ error: 'No SendGrid domain configured yet.' });
      }

      let response;
      try {
        response = await validateDomainAuth(doc.sendgridDomainId);
      } catch (err) {
        console.error('[sendgrid domain] validate failed', err?.response?.body || err);
        throw err;
      }

      const now = new Date();
      const valid = response?.valid === true;
      const validationResults = response?.validation_results || response || {};
      const hasErrors = Array.isArray(validationResults?.errors) && validationResults.errors.length > 0;
      const nextStatus = valid
        ? CompanyEmailDomain.STATUS.VERIFIED
        : (hasErrors ? CompanyEmailDomain.STATUS.FAILED : CompanyEmailDomain.STATUS.PENDING);
      const dnsRecords = normalizeDnsRecords(response);

      doc.status = nextStatus;
      doc.lastValidation = {
        valid,
        results: validationResults,
        checkedAt: now
      };
      doc.lastValidatedAt = now;
      if (dnsRecords.length) doc.dnsRecords = dnsRecords;
      if (valid) doc.verifiedAt = now;

      await doc.save();

      if (valid) {
        const company = await Company.findById(companyId)
          .select('emailDomainVerifiedAt emailWarmup')
          .lean();
        if (company && !company.emailDomainVerifiedAt) {
          const warmupState = buildWarmupStartState({ startedAt: now });
          await Company.updateOne(
            { _id: companyId },
            {
              $set: {
                emailDomainVerifiedAt: now,
                emailWarmup: warmupState
              }
            }
          );
        }
      }

      return res.json(serializeEmailDomain(doc.toObject ? doc.toObject() : doc));
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/:companyId/email-domain',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const doc = await CompanyEmailDomain.findOne({ companyId });
      if (!doc) {
        return res.json(serializeEmailDomain(null));
      }

      doc.status = CompanyEmailDomain.STATUS.REMOVED;
      doc.sendgridDomainId = null;
      doc.dnsRecords = [];
      doc.lastValidation = { valid: null, results: {}, checkedAt: null };
      doc.verifiedAt = null;
      doc.lastValidatedAt = null;

      await doc.save();

      return res.json(serializeEmailDomain(doc.toObject ? doc.toObject() : doc));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:companyId/email-sending/resume',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const company = await Company.findById(companyId);
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      if (company.emailSendingPaused) {
        company.emailSendingPaused = false;
        company.emailSendingPausedAt = null;
        company.emailSendingPausedBy = null;
        company.emailSendingPausedReason = null;
        company.emailSendingPausedMeta = null;
        await company.save();
      }

      await EmailJob.updateMany(
        {
          companyId,
          status: EmailJob.STATUS.QUEUED,
          lastError: 'COMPANY_SENDING_PAUSED'
        },
        { $set: { lastError: null, nextAttemptAt: null } }
      );

      return res.json(serializeCompany(company));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:companyId/email-warmup',
  requireRole('COMPANY_ADMIN', 'SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req, req.params.companyId);
      if (!companyId) {
        return res.status(400).json({ error: 'Invalid company context' });
      }

      const action = String(req.body?.action || '').toLowerCase();
      if (!['reset', 'disable', 'enable'].includes(action)) {
        return res.status(400).json({ error: 'Invalid warm-up action.' });
      }

      const company = await Company.findById(companyId)
        .select('emailDomainVerifiedAt emailWarmup')
        .lean();
      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      const domainDoc = await CompanyEmailDomain.findOne({ companyId })
        .select('status domain')
        .lean();
      const domainVerified = domainDoc?.status === CompanyEmailDomain.STATUS.VERIFIED;
      if ((action === 'reset' || action === 'enable') && !domainVerified) {
        return res.status(400).json({ error: 'Domain must be verified to start warm-up.' });
      }

      const now = new Date();
      let update = {};

      if (action === 'disable') {
        update = {
          'emailWarmup.enabled': false,
          'emailWarmup.endedAt': now,
          'emailWarmup.lastComputedAt': now,
          'emailWarmup.dayIndex': null,
          'emailWarmup.capOverrideToday': null
        };
      } else {
        const warmupState = buildWarmupStartState({
          startedAt: now,
          schedule: company?.emailWarmup?.schedule,
          daysTotal: company?.emailWarmup?.daysTotal
        });
        update = {
          emailWarmup: warmupState
        };
        if (!company.emailDomainVerifiedAt) {
          update.emailDomainVerifiedAt = now;
        }
      }

      await Company.updateOne({ _id: companyId }, { $set: update });
      await AuditLog.create({
        companyId,
        actorId: req.user?._id || null,
        action: `email_warmup_${action}`,
        meta: {
          domain: domainDoc?.domain || null
        }
      });

      const updated = await Company.findById(companyId)
        .select('emailWarmup emailDomainVerifiedAt')
        .lean();

      return res.json({
        emailWarmup: updated?.emailWarmup || null,
        emailDomainVerifiedAt: updated?.emailDomainVerifiedAt || null
      });
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
        notes,
        emailDailyCapEnabled,
        emailDailyCap,
        emailAutoPauseOnSpamReport,
        emailAutoPauseOnBounceRate,
        emailBounceRateThreshold,
        emailBounceMinSentForEvaluation
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

      if (typeof emailDailyCapEnabled === 'boolean') {
        company.emailDailyCapEnabled = emailDailyCapEnabled;
      }

      if (emailDailyCap != null) {
        const capValue = Number(emailDailyCap);
        if (!Number.isFinite(capValue) || capValue < 0 || capValue > 100000 || !Number.isInteger(capValue)) {
          return res.status(400).json({ error: 'Daily cap must be an integer between 0 and 100000.' });
        }
        company.emailDailyCap = capValue;
      }

      if (typeof emailAutoPauseOnSpamReport === 'boolean') {
        company.emailAutoPauseOnSpamReport = emailAutoPauseOnSpamReport;
      }
      if (typeof emailAutoPauseOnBounceRate === 'boolean') {
        company.emailAutoPauseOnBounceRate = emailAutoPauseOnBounceRate;
      }
      if (emailBounceRateThreshold != null) {
        const thresholdValue = Number(emailBounceRateThreshold);
        if (!Number.isFinite(thresholdValue) || thresholdValue < 0 || thresholdValue > 1) {
          return res.status(400).json({ error: 'Bounce rate threshold must be between 0 and 1.' });
        }
        company.emailBounceRateThreshold = thresholdValue;
      }
      if (emailBounceMinSentForEvaluation != null) {
        const minValue = Number(emailBounceMinSentForEvaluation);
        if (!Number.isFinite(minValue) || minValue < 0 || minValue > 100000 || !Number.isInteger(minValue)) {
          return res.status(400).json({ error: 'Bounce min sent must be an integer between 0 and 100000.' });
        }
        company.emailBounceMinSentForEvaluation = minValue;
      }

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
