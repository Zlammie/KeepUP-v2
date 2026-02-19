const express = require('express');
const mongoose = require('mongoose');
const Company = require('../models/Company');
const StripeEventLog = require('../models/StripeEventLog');
const {
  assertStripeConfigured,
  getStripeClient,
  syncCompanySubscriptionQuantities,
  subscriptionIsManagedActive
} = require('../services/stripeService');

const router = express.Router();

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const toIsoDateFromUnix = (unixSeconds) => {
  if (!Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000);
};

const getRawBodyBuffer = (req) => {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body));
  }
  return Buffer.from(String(req.body || ''));
};

const loadCompanyById = async (companyId) => {
  if (isObjectId(companyId)) {
    return Company.findById(companyId).exec();
  }
  return null;
};

const loadCompanyByCustomerId = async (customerId) => {
  if (!customerId) return null;
  return Company.findOne({
    'billing.stripeCustomerId': String(customerId)
  }).exec();
};

const loadCompanyBySubscriptionId = async (subscriptionId) => {
  if (!subscriptionId) return null;
  return Company.findOne({
    'billing.stripeSubscriptionId': String(subscriptionId)
  }).exec();
};

const resolveCompanyForCheckout = async ({ companyId, customerId, subscriptionId }) => {
  if (isObjectId(companyId)) {
    const company = await loadCompanyById(companyId);
    if (company) return { company, lookupMethod: 'metadata.companyId' };
  }
  if (customerId) {
    const company = await loadCompanyByCustomerId(customerId);
    if (company) return { company, lookupMethod: 'billing.stripeCustomerId' };
  }
  if (subscriptionId) {
    const company = await loadCompanyBySubscriptionId(subscriptionId);
    if (company) return { company, lookupMethod: 'billing.stripeSubscriptionId' };
  }
  return { company: null, lookupMethod: null };
};

const resolveCompanyForSubscription = async ({ companyId, customerId, subscriptionId }) => {
  if (isObjectId(companyId)) {
    const company = await loadCompanyById(companyId);
    if (company) return { company, lookupMethod: 'subscription.metadata.companyId' };
  }
  if (customerId) {
    const company = await loadCompanyByCustomerId(customerId);
    if (company) return { company, lookupMethod: 'billing.stripeCustomerId' };
  }
  if (subscriptionId) {
    const company = await loadCompanyBySubscriptionId(subscriptionId);
    if (company) return { company, lookupMethod: 'billing.stripeSubscriptionId' };
  }
  return { company: null, lookupMethod: null };
};

const extractEventRefs = (event) => {
  const object = event?.data?.object || {};
  const objectType = object.object || null;
  const customerId = object?.customer ? String(object.customer) : null;
  const subscriptionId = object?.subscription
    ? String(typeof object.subscription === 'object' ? object.subscription.id : object.subscription)
    : (objectType === 'subscription' && object.id ? String(object.id) : null);
  const metadataCompanyId = object?.metadata?.companyId || null;
  return {
    objectType,
    customerId,
    subscriptionId,
    metadataCompanyId
  };
};

const markEventProcessed = async (eventId, updates = {}) => {
  await StripeEventLog.updateOne(
    { eventId },
    {
      $set: {
        status: 'processed',
        processedAt: new Date(),
        ...updates
      }
    }
  );
};

const markEventFailed = async (eventId, error) => {
  await StripeEventLog.updateOne(
    { eventId },
    {
      $set: {
        status: 'failed',
        lastError: String(error?.message || error || 'Unknown webhook error')
      }
    }
  );
};

const claimEvent = async (event) => {
  const eventId = String(event.id || '');
  if (!eventId) {
    return { process: false };
  }

  try {
    const created = await StripeEventLog.create({
      eventId,
      type: event.type,
      status: 'processing',
      attempts: 1
    });
    return { process: true, log: created };
  } catch (err) {
    if (err?.code !== 11000) throw err;

    const existing = await StripeEventLog.findOne({ eventId }).exec();
    if (!existing) return { process: false };

    if (existing.status === 'processed' || existing.status === 'processing') {
      return { process: false, log: existing };
    }

    existing.status = 'processing';
    existing.attempts = Number(existing.attempts || 0) + 1;
    existing.lastError = null;
    await existing.save();
    return { process: true, log: existing };
  }
};

const updateCompanyBilling = async (company, patch, contextLabel) => {
  company.billing = company.billing || {};
  const trackedFields = [
    'stripeCustomerId',
    'stripeSubscriptionId',
    'stripeSubscriptionStatus',
    'currentPeriodEnd',
    'hasStripe',
    'hasPaymentMethodOnFile',
    'stripeDefaultPaymentMethodId',
    'stripeLastPaymentMethodCheckAt'
  ];

  const changes = {};
  for (const key of trackedFields) {
    if (!(key in patch)) continue;
    const nextValue = patch[key];
    const prevValue = company.billing[key];
    const prevComparable = prevValue instanceof Date ? prevValue.toISOString() : prevValue;
    const nextComparable = nextValue instanceof Date ? nextValue.toISOString() : nextValue;
    if (prevComparable === nextComparable) continue;
    company.billing[key] = nextValue;
    changes[key] = { from: prevComparable ?? null, to: nextComparable ?? null };
  }

  if (!Object.keys(changes).length) {
    return { changed: false };
  }

  company.markModified('billing');
  await company.save();
  console.info('[stripe webhook] company billing updated', {
    context: contextLabel,
    companyId: String(company._id),
    changes
  });
  return { changed: true, changes };
};

const getPaymentMethodId = (paymentMethod) => {
  if (!paymentMethod) return null;
  if (typeof paymentMethod === 'string') return paymentMethod;
  if (typeof paymentMethod === 'object' && paymentMethod.id) {
    return String(paymentMethod.id);
  }
  return null;
};

const handleSetupSessionCompleted = async ({ event, stripe, hydratedSession }) => {
  const customerId = hydratedSession?.customer ? String(hydratedSession.customer) : null;
  const metadataCompanyId = hydratedSession?.metadata?.companyId || null;
  const metadataCompanySlug = hydratedSession?.metadata?.companySlug || null;
  const sessionSetupPaymentMethodId = getPaymentMethodId(
    hydratedSession?.setup_intent?.payment_method || hydratedSession?.setup_intent
  );

  const { company, lookupMethod } = await resolveCompanyForCheckout({
    companyId: metadataCompanyId,
    customerId,
    subscriptionId: null
  });

  console.info('[stripe webhook] checkout.session.completed setup lookup', {
    eventId: event.id,
    customerId,
    metadataCompanyId,
    metadataCompanySlug,
    lookupMethod
  });

  if (!company) {
    console.warn('[stripe webhook] unmatched checkout.session.completed (setup)', {
      eventId: event.id,
      customerId,
      metadataCompanyId,
      metadataCompanySlug
    });
    return { matched: false };
  }

  let customerDefaultPaymentMethodId = null;
  let chosenPaymentMethodId = null;
  let chosenPaymentMethodSource = null;
  if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method']
      });
      customerDefaultPaymentMethodId = getPaymentMethodId(customer?.invoice_settings?.default_payment_method);
      if (customerDefaultPaymentMethodId) {
        chosenPaymentMethodId = customerDefaultPaymentMethodId;
        chosenPaymentMethodSource = 'customer.invoice_settings.default_payment_method';
      }
    } catch (err) {
      console.warn('[stripe webhook] unable to load customer default payment method after setup', {
        eventId: event.id,
        customerId,
        companyId: String(company._id),
        error: err?.message || err
      });
    }

    if (!chosenPaymentMethodId && sessionSetupPaymentMethodId) {
      chosenPaymentMethodId = sessionSetupPaymentMethodId;
      chosenPaymentMethodSource = 'checkout.session.setup_intent.payment_method';
    }

    if (!chosenPaymentMethodId) {
      try {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: customerId,
          type: 'card',
          limit: 1
        });
        const fallbackPaymentMethodId = getPaymentMethodId(paymentMethods?.data?.[0]);
        if (fallbackPaymentMethodId) {
          chosenPaymentMethodId = fallbackPaymentMethodId;
          chosenPaymentMethodSource = 'payment_methods.list(card)[0]';
        }
      } catch (err) {
        console.warn('[stripe webhook] unable to list customer payment methods after setup', {
          eventId: event.id,
          customerId,
          companyId: String(company._id),
          error: err?.message || err
        });
      }
    }

    if (chosenPaymentMethodId && chosenPaymentMethodId !== customerDefaultPaymentMethodId) {
      try {
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: chosenPaymentMethodId
          }
        });
      } catch (err) {
        console.warn('[stripe webhook] unable to set customer default payment method after setup', {
          eventId: event.id,
          customerId,
          companyId: String(company._id),
          chosenPaymentMethodId,
          error: err?.message || err
        });
      }
    }
  } else if (sessionSetupPaymentMethodId) {
    chosenPaymentMethodId = sessionSetupPaymentMethodId;
    chosenPaymentMethodSource = 'checkout.session.setup_intent.payment_method';
  }

  await updateCompanyBilling(company, {
    stripeCustomerId: customerId || company.billing?.stripeCustomerId || null,
    hasPaymentMethodOnFile: Boolean(chosenPaymentMethodId || company.billing?.hasPaymentMethodOnFile),
    stripeDefaultPaymentMethodId: chosenPaymentMethodId || company.billing?.stripeDefaultPaymentMethodId || null,
    stripeLastPaymentMethodCheckAt: new Date()
  }, 'checkout.session.completed.setup');

  console.info('[stripe webhook] setup payment method resolved', {
    eventId: event.id,
    companyId: String(company._id),
    customerId,
    chosenPaymentMethodId: chosenPaymentMethodId || null,
    chosenPaymentMethodSource: chosenPaymentMethodSource || null
  });

  return { matched: true, companyId: String(company._id) };
};

const handleCheckoutSessionCompleted = async (event) => {
  const stripe = getStripeClient();
  const incomingSession = event.data?.object || {};
  const hydratedSession = await stripe.checkout.sessions.retrieve(incomingSession.id, {
    expand: ['subscription', 'setup_intent.payment_method']
  });
  const sessionMode = String(hydratedSession?.mode || incomingSession?.mode || '').trim().toLowerCase();
  if (sessionMode === 'setup') {
    return handleSetupSessionCompleted({ event, stripe, hydratedSession });
  }

  const expandedSubscription = hydratedSession?.subscription && typeof hydratedSession.subscription === 'object'
    ? hydratedSession.subscription
    : null;
  const subscriptionId = expandedSubscription?.id
    || (hydratedSession?.subscription ? String(hydratedSession.subscription) : null);
  const customerId = hydratedSession?.customer ? String(hydratedSession.customer) : null;

  let subscription = expandedSubscription;
  if (!subscription && subscriptionId) {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  }

  const metadataCompanyId = hydratedSession?.metadata?.companyId
    || subscription?.metadata?.companyId
    || null;
  const metadataCompanySlug = hydratedSession?.metadata?.companySlug
    || subscription?.metadata?.companySlug
    || null;

  const { company, lookupMethod } = await resolveCompanyForCheckout({
    companyId: metadataCompanyId,
    customerId,
    subscriptionId
  });

  console.info('[stripe webhook] checkout.session.completed lookup', {
    eventId: event.id,
    customerId,
    subscriptionId,
    metadataCompanyId,
    metadataCompanySlug,
    lookupMethod
  });

  if (!company) {
    console.warn('[stripe webhook] unmatched checkout.session.completed', {
      eventId: event.id,
      customerId,
      subscriptionId,
      metadataCompanyId,
      metadataCompanySlug
    });
    return { matched: false };
  }

  const subscriptionStatus = subscription?.status ? String(subscription.status) : null;
  const currentPeriodEnd = subscription?.current_period_end
    ? toIsoDateFromUnix(subscription.current_period_end)
    : null;

  await updateCompanyBilling(company, {
    stripeCustomerId: customerId || company.billing?.stripeCustomerId || null,
    stripeSubscriptionId: subscriptionId || company.billing?.stripeSubscriptionId || null,
    stripeSubscriptionStatus: subscriptionStatus || company.billing?.stripeSubscriptionStatus || null,
    currentPeriodEnd,
    hasStripe: Boolean(subscriptionId) && (
      subscriptionStatus ? subscriptionIsManagedActive(subscriptionStatus) : true
    )
  }, 'checkout.session.completed');

  if (subscriptionId) {
    await syncCompanySubscriptionQuantities(company._id, { company });
  }
  return { matched: true, companyId: String(company._id) };
};

const handleSubscriptionLifecycleEvent = async (event) => {
  const subscription = event.data?.object || {};
  const customerId = subscription.customer ? String(subscription.customer) : null;
  const subscriptionId = subscription.id ? String(subscription.id) : null;
  const metadataCompanyId = subscription?.metadata?.companyId || null;
  const metadataCompanySlug = subscription?.metadata?.companySlug || null;

  const { company, lookupMethod } = await resolveCompanyForSubscription({
    companyId: metadataCompanyId,
    customerId,
    subscriptionId
  });

  console.info('[stripe webhook] subscription lifecycle lookup', {
    eventType: event.type,
    eventId: event.id,
    customerId,
    subscriptionId,
    metadataCompanyId,
    metadataCompanySlug,
    lookupMethod
  });

  if (!company) {
    console.warn('[stripe webhook] unmatched subscription lifecycle event', {
      eventType: event.type,
      eventId: event.id,
      customerId,
      subscriptionId,
      metadataCompanyId,
      metadataCompanySlug
    });
    return { matched: false };
  }

  const status = subscription?.status ? String(subscription.status) : null;
  const currentPeriodEnd = subscription?.current_period_end
    ? toIsoDateFromUnix(subscription.current_period_end)
    : null;

  await updateCompanyBilling(company, {
    stripeCustomerId: customerId || company.billing?.stripeCustomerId || null,
    stripeSubscriptionId: subscriptionId || company.billing?.stripeSubscriptionId || null,
    stripeSubscriptionStatus: status || company.billing?.stripeSubscriptionStatus || null,
    currentPeriodEnd,
    hasStripe: Boolean(subscriptionId) && subscriptionIsManagedActive(status)
  }, event.type);
  return { matched: true, companyId: String(company._id) };
};

const handleInvoicePaid = async (event) => {
  const invoice = event.data?.object || {};
  const customerId = invoice.customer ? String(invoice.customer) : null;
  const subscriptionId = invoice.subscription ? String(invoice.subscription) : null;
  const company = await loadCompanyByCustomerId(customerId) || await loadCompanyBySubscriptionId(subscriptionId);
  if (!company) {
    console.warn('[stripe webhook] unmatched invoice.paid', {
      eventId: event.id,
      customerId,
      subscriptionId
    });
    return { matched: false };
  }

  await updateCompanyBilling(company, {
    stripeCustomerId: customerId || company.billing?.stripeCustomerId || null,
    stripeSubscriptionId: subscriptionId || company.billing?.stripeSubscriptionId || null,
    stripeSubscriptionStatus: 'active',
    hasStripe: Boolean(subscriptionId || company.billing?.stripeSubscriptionId)
  }, 'invoice.paid');
  return { matched: true, companyId: String(company._id) };
};

const handleInvoicePaymentFailed = async (event) => {
  const invoice = event.data?.object || {};
  const customerId = invoice.customer ? String(invoice.customer) : null;
  const subscriptionId = invoice.subscription ? String(invoice.subscription) : null;
  const company = await loadCompanyByCustomerId(customerId) || await loadCompanyBySubscriptionId(subscriptionId);
  if (!company) {
    console.warn('[stripe webhook] unmatched invoice.payment_failed', {
      eventId: event.id,
      customerId,
      subscriptionId
    });
    return { matched: false };
  }

  await updateCompanyBilling(company, {
    stripeCustomerId: customerId || company.billing?.stripeCustomerId || null,
    stripeSubscriptionId: subscriptionId || company.billing?.stripeSubscriptionId || null,
    stripeSubscriptionStatus: 'past_due',
    hasStripe: Boolean(subscriptionId || company.billing?.stripeSubscriptionId)
  }, 'invoice.payment_failed');
  return { matched: true, companyId: String(company._id) };
};

const handleStripeEvent = async (event) => {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutSessionCompleted(event);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return handleSubscriptionLifecycleEvent(event);
    case 'invoice.paid':
      return handleInvoicePaid(event);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event);
    default:
      return { matched: false, ignored: true };
  }
};

router.post('/webhook', async (req, res) => {
  try {
    assertStripeConfigured();
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }

  const signature = req.get('stripe-signature');
  const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!signature || !webhookSecret) {
    return res.status(400).json({ error: 'Stripe webhook signature verification is not configured.' });
  }

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(getRawBodyBuffer(req), signature, webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  const refs = extractEventRefs(event);
  console.info('[stripe webhook] received', {
    eventType: event.type,
    eventId: event.id,
    objectType: refs.objectType,
    customerId: refs.customerId,
    subscriptionId: refs.subscriptionId,
    metadataCompanyId: refs.metadataCompanyId
  });

  const claim = await claimEvent(event);
  if (!claim.process) {
    console.info('[stripe webhook] duplicate ignored', { eventId: event.id, eventType: event.type });
    return res.json({ received: true, duplicate: true });
  }

  try {
    const result = await handleStripeEvent(event);
    await markEventProcessed(
      event.id,
      result?.companyId && isObjectId(result.companyId) ? { companyId: result.companyId } : {}
    );
    return res.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] event handling failed', { eventId: event.id, type: event.type, err });
    await markEventFailed(event.id, err);
    return res.status(500).json({ error: 'Webhook handler failed.' });
  }
});

module.exports = router;
