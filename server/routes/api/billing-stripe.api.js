const express = require('express');
const mongoose = require('mongoose');
const requireRole = require('../../middleware/requireRole');
const Company = require('../../models/Company');
const {
  assertStripeConfigured,
  createCheckoutSessionForCompany,
  createSetupSessionForCompany,
  createCustomerPortalSession,
  isNoSuchCustomerError
} = require('../../services/stripeService');
const {
  KEEPUP_MANAGED_BILLING_MESSAGE,
  isSelfServeBillingBlocked
} = require('../../utils/stripeBillingPolicy');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const hasRole = (req, role) => Array.isArray(req.user?.roles) && req.user.roles.includes(role);
const canOverrideCompany = (req) => hasRole(req, 'SUPER_ADMIN') || hasRole(req, 'KEEPUP_ADMIN');

const resolveCompanyId = (req, rawCompanyId) => {
  const scopedCompanyId = canOverrideCompany(req) && isObjectId(rawCompanyId)
    ? rawCompanyId
    : req.user.company;
  return isObjectId(scopedCompanyId) ? scopedCompanyId : null;
};

router.use(requireRole('COMPANY_ADMIN', 'SUPER_ADMIN', 'KEEPUP_ADMIN'));

router.post('/checkout', async (req, res, next) => {
  try {
    assertStripeConfigured();
    const companyId = resolveCompanyId(req, req.body?.companyId);
    if (!companyId) {
      return res.status(400).json({ error: 'Invalid company context' });
    }

    const company = await Company.findById(companyId)
      .select('name slug billing billingPolicy features')
      .exec();
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    if (isSelfServeBillingBlocked(company)) {
      return res.status(400).json({ error: KEEPUP_MANAGED_BILLING_MESSAGE });
    }

    const existingSubscriptionId = company?.billing?.stripeSubscriptionId || null;
    const existingStatus = String(company?.billing?.stripeSubscriptionStatus || '').trim().toLowerCase();
    const restartableStatuses = new Set(['canceled', 'incomplete_expired']);
    if (existingSubscriptionId && !restartableStatuses.has(existingStatus)) {
      return res.status(400).json({ error: 'Stripe subscription already exists. Use Manage Billing.' });
    }

    const { session } = await createCheckoutSessionForCompany(company, '/admin?tab=billing');
    console.info('[stripe checkout endpoint] checkout session response', {
      companyId: String(company._id),
      sessionId: session.id,
      url: session.url
    });
    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    if (err?.message && err.message.includes('Stripe is not configured')) {
      return res.status(503).json({ error: err.message });
    }
    if (isNoSuchCustomerError(err)) {
      return res.status(400).json({ error: 'Stored Stripe customer was not found in Stripe. Start Subscription to recreate billing.' });
    }
    next(err);
  }
});

router.post('/portal', async (req, res, next) => {
  try {
    assertStripeConfigured();
    const companyId = resolveCompanyId(req, req.body?.companyId);
    if (!companyId) {
      return res.status(400).json({ error: 'Invalid company context' });
    }

    const company = await Company.findById(companyId)
      .select('name billing')
      .exec();
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }
    if (!company?.billing?.stripeCustomerId) {
      return res.status(400).json({ error: 'No Stripe customer found for this company.' });
    }

    const session = await createCustomerPortalSession(company, '/admin?tab=billing');
    return res.json({ url: session.url });
  } catch (err) {
    if (err?.message && err.message.includes('Stripe is not configured')) {
      return res.status(503).json({ error: err.message });
    }
    if (isNoSuchCustomerError(err) || String(err?.message || '').includes('Stored Stripe customer was not found')) {
      return res.status(400).json({ error: 'Stored Stripe customer was not found in Stripe. Start Subscription to recreate billing.' });
    }
    next(err);
  }
});

router.post('/setup', async (req, res, next) => {
  try {
    assertStripeConfigured();
    const companyId = resolveCompanyId(req, req.body?.companyId);
    if (!companyId) {
      return res.status(400).json({ error: 'Invalid company context' });
    }

    const company = await Company.findById(companyId)
      .select('name slug billing billingPolicy features')
      .exec();
    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    const session = await createSetupSessionForCompany(company, '/admin?tab=billing');
    return res.json({ url: session.url, sessionId: session.sessionId });
  } catch (err) {
    if (err?.message && err.message.includes('Stripe is not configured')) {
      return res.status(503).json({ error: err.message });
    }
    if (isNoSuchCustomerError(err) || String(err?.message || '').includes('Stored Stripe customer was not found')) {
      return res.status(400).json({ error: 'Stored Stripe customer was not found in Stripe. Start Subscription to recreate billing.' });
    }
    next(err);
  }
});

module.exports = router;
