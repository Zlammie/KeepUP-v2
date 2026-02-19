const Stripe = require('stripe');
const Company = require('../models/Company');
const Community = require('../models/Community');
const { getSeatCounts } = require('../utils/seatCounts');
const {
  deriveStripeBillability,
  isSelfServeBillingBlocked
} = require('../utils/stripeBillingPolicy');

let stripeClient = null;

const isStripeConfigured = () => Boolean((process.env.STRIPE_SECRET_KEY || '').trim());
const isNoSuchCustomerError = (err) => {
  const message = String(err?.message || '').toLowerCase();
  return (
    message.includes('no such customer')
    || (String(err?.code || '').toLowerCase() === 'resource_missing' && String(err?.param || '').toLowerCase() === 'customer')
  );
};

const assertStripeConfigured = () => {
  if (!isStripeConfigured()) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
  }
};

const getStripeClient = () => {
  assertStripeConfigured();
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY.trim());
  }
  return stripeClient;
};

const getStripePriceIds = () => {
  const required = {
    seatsBase: 'STRIPE_PRICE_SEATS_BASE',
    seatsAdditional: 'STRIPE_PRICE_SEATS_ADDL',
    buildrootz: 'STRIPE_PRICE_BUILDROOTZ',
    websiteMap: 'STRIPE_PRICE_WEBSITEMAP'
  };

  const resolved = {};
  for (const [key, envName] of Object.entries(required)) {
    const value = String(process.env[envName] || '').trim();
    if (!value) {
      throw new Error(`Missing Stripe env var: ${envName}`);
    }
    if (/^prod_/i.test(value)) {
      throw new Error(
        `Invalid Stripe id in ${envName}: expected a Price ID (price_...), got Product ID (${value}).`
      );
    }
    if (!/^price_/i.test(value)) {
      throw new Error(`Invalid Stripe Price ID in ${envName}: ${value}`);
    }
    resolved[key] = value;
  }
  return resolved;
};

const resolveAppBaseUrl = () => {
  const base = String(process.env.APP_BASE_URL || process.env.BASE_URL || '').trim();
  if (!base) {
    throw new Error('Missing APP_BASE_URL environment variable.');
  }
  return base.replace(/\/+$/, '');
};

const withQueryParam = (url, key, value) => {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
};

const subscriptionIsManagedActive = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized && !['canceled', 'incomplete_expired'].includes(normalized);
};

const resolveReturnUrl = (returnUrl) => {
  const appBaseUrl = resolveAppBaseUrl();
  if (!returnUrl) {
    return `${appBaseUrl}/admin?tab=billing`;
  }
  if (/^https?:\/\//i.test(returnUrl)) {
    return returnUrl;
  }
  return new URL(returnUrl, `${appBaseUrl}/`).toString();
};

const toCompanyDoc = async (companyOrId) => {
  if (!companyOrId) return null;
  if (typeof companyOrId.save === 'function') {
    return companyOrId;
  }
  const companyId = companyOrId._id || companyOrId;
  return Company.findById(companyId);
};

const isBuildrootzActive = (company) => {
  const feature = company?.features?.buildrootz || {};
  const status = String(feature.status || '').trim().toLowerCase();
  if (status) {
    return status === 'active';
  }
  return !!feature.enabled;
};

const computeCompanyStripeQuantities = async (company) => {
  const [seatCounts, websiteMapQtyRaw] = await Promise.all([
    getSeatCounts(company._id),
    Community.countDocuments({
      company: company._id,
      'websiteMap.status': 'active'
    })
  ]);

  const activeUsers = Number(seatCounts?.active || 0);
  const websiteMapQty = Number(websiteMapQtyRaw || 0);
  const buildrootzActive = isBuildrootzActive(company);
  const websiteMapActiveQty = websiteMapQty;
  const billability = deriveStripeBillability(company, {
    activeUsers,
    buildrootzActive,
    websiteMapActiveQty
  });

  return {
    activeUsers,
    seatAddlQty: Math.max(0, activeUsers - 3),
    buildrootzQty: buildrootzActive ? 1 : 0,
    websiteMapQty,
    buildrootzActive,
    websiteMapActiveQty,
    seatBillable: billability.seatBillable,
    buildrootzBillable: billability.buildrootzBillable,
    websiteMapBillable: billability.websiteMapBillable,
    shouldUseStripe: billability.shouldUseStripe
  };
};

const buildDesiredItemQuantities = (quantities) => ({
  seatsBaseQty: quantities.seatBillable ? 1 : 0,
  seatsAdditionalQty: quantities.seatBillable ? Math.max(0, Number(quantities.seatAddlQty || 0)) : 0,
  buildrootzQty: quantities.buildrootzBillable ? 1 : 0,
  websiteMapQty: quantities.websiteMapBillable ? Math.max(0, Number(quantities.websiteMapQty || 0)) : 0
});

const getPaymentMethodId = (paymentMethod) => {
  if (!paymentMethod) return null;
  if (typeof paymentMethod === 'string') return paymentMethod;
  if (typeof paymentMethod === 'object' && paymentMethod.id) {
    return String(paymentMethod.id);
  }
  return null;
};

const resolveCompanyDefaultPaymentMethodId = async ({ stripe, companyDoc, customerId }) => {
  const storedPaymentMethodId = String(companyDoc?.billing?.stripeDefaultPaymentMethodId || '').trim();
  if (storedPaymentMethodId) {
    return { paymentMethodId: storedPaymentMethodId, source: 'company.billing.stripeDefaultPaymentMethodId' };
  }

  const hasPaymentMethodOnFile = !!companyDoc?.billing?.hasPaymentMethodOnFile;
  if (!hasPaymentMethodOnFile || !customerId) {
    return { paymentMethodId: null, source: null };
  }

  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method']
    });
    const customerDefaultPaymentMethodId = getPaymentMethodId(customer?.invoice_settings?.default_payment_method);
    if (!customerDefaultPaymentMethodId) {
      return { paymentMethodId: null, source: null };
    }

    companyDoc.billing = companyDoc.billing || {};
    const changed = (
      String(companyDoc.billing.stripeDefaultPaymentMethodId || '').trim() !== customerDefaultPaymentMethodId
      || !companyDoc.billing.hasPaymentMethodOnFile
    );
    if (changed) {
      companyDoc.billing.stripeDefaultPaymentMethodId = customerDefaultPaymentMethodId;
      companyDoc.billing.hasPaymentMethodOnFile = true;
      companyDoc.billing.stripeLastPaymentMethodCheckAt = new Date();
      companyDoc.markModified('billing');
      await companyDoc.save();
    }

    return {
      paymentMethodId: customerDefaultPaymentMethodId,
      source: 'stripe.customer.invoice_settings.default_payment_method'
    };
  } catch (err) {
    console.warn('[stripe sync] unable to resolve customer default payment method', {
      companyId: String(companyDoc?._id || ''),
      customerId,
      error: err?.message || err
    });
    return { paymentMethodId: null, source: null };
  }
};

const getOrCreateCustomer = async (company, options = {}) => {
  const { includeMeta = false } = options || {};
  const stripe = getStripeClient();
  const companyDoc = await toCompanyDoc(company);
  if (!companyDoc) {
    throw new Error('Company not found.');
  }

  const existingCustomerId = companyDoc?.billing?.stripeCustomerId || companyDoc.billingCustomerId || null;
  if (existingCustomerId) {
    try {
      const existingCustomer = await stripe.customers.retrieve(existingCustomerId);
      if (existingCustomer && !existingCustomer.deleted) {
        return includeMeta
          ? { customerId: existingCustomerId, created: false }
          : existingCustomerId;
      }
    } catch (err) {
      if (!isNoSuchCustomerError(err)) {
        throw err;
      }
      console.warn('[stripe customer] stale customer id on company; recreating', {
        companyId: String(companyDoc._id),
        stripeCustomerId: existingCustomerId,
        error: err?.message || err
      });
    }
  }

  const customer = await stripe.customers.create({
    name: companyDoc.name || undefined,
    metadata: {
      companyId: String(companyDoc._id)
    }
  });

  companyDoc.billing = companyDoc.billing || {};
  companyDoc.billing.stripeCustomerId = customer.id;
  companyDoc.billingCustomerId = customer.id;
  companyDoc.markModified('billing');
  await companyDoc.save();

  return includeMeta
    ? { customerId: customer.id, created: true }
    : customer.id;
};

const createCheckoutSessionForCompany = async (company, returnUrl) => {
  const stripe = getStripeClient();
  const priceIds = getStripePriceIds();
  const companyDoc = await toCompanyDoc(company);
  if (!companyDoc) {
    throw new Error('Company not found.');
  }
  if (isSelfServeBillingBlocked(companyDoc)) {
    throw new Error('This account is managed by KeepUp; billing is not self-serve.');
  }

  const priorCustomerId = companyDoc?.billing?.stripeCustomerId || companyDoc.billingCustomerId || null;
  const customerId = await getOrCreateCustomer(companyDoc);
  const createdNewCustomer = !priorCustomerId;
  const quantities = await computeCompanyStripeQuantities(companyDoc);
  const desired = buildDesiredItemQuantities(quantities);
  const baseReturnUrl = resolveReturnUrl(returnUrl);
  const companySlug = String(companyDoc.slug || companyDoc.name || '').trim();
  const successUrl = withQueryParam(baseReturnUrl, 'stripe', 'success');
  const cancelUrl = withQueryParam(baseReturnUrl, 'stripe', 'cancel');

  const lineItems = [
    {
      price: priceIds.seatsBase,
      quantity: desired.seatsBaseQty
    }
  ];

  if (desired.seatsAdditionalQty > 0) {
    lineItems.push({
      price: priceIds.seatsAdditional,
      quantity: desired.seatsAdditionalQty
    });
  }
  if (desired.buildrootzQty > 0) {
    lineItems.push({
      price: priceIds.buildrootz,
      quantity: 1
    });
  }
  if (desired.websiteMapQty > 0) {
    lineItems.push({
      price: priceIds.websiteMap,
      quantity: desired.websiteMapQty
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: String(companyDoc._id),
    metadata: {
      companyId: String(companyDoc._id),
      companySlug
    },
    subscription_data: {
      metadata: {
        companyId: String(companyDoc._id),
        companySlug
      }
    },
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  console.info('[stripe checkout] session created', {
    companyId: String(companyDoc._id),
    companyName: companyDoc.name || null,
    companySlug: companySlug || null,
    stripeCustomerId: customerId,
    stripeCustomerCreated: createdNewCustomer,
    sessionId: session.id,
    sessionUrl: session.url,
    mode: session.mode,
    successUrl
  });

  return { session, quantities };
};

const createSetupSessionForCompany = async (company, returnUrl) => {
  const stripe = getStripeClient();
  const companyDoc = await toCompanyDoc(company);
  if (!companyDoc) {
    throw new Error('Company not found.');
  }

  const customerId = await getOrCreateCustomer(companyDoc);
  const baseReturnUrl = resolveReturnUrl(returnUrl || '/admin?tab=billing');
  const companySlug = String(companyDoc.slug || companyDoc.name || '').trim();
  const successUrl = withQueryParam(baseReturnUrl, 'stripe', 'setup_success');
  const cancelUrl = withQueryParam(baseReturnUrl, 'stripe', 'setup_cancel');

  const session = await stripe.checkout.sessions.create({
    mode: 'setup',
    currency: 'usd',
    customer: customerId,
    metadata: {
      companyId: String(companyDoc._id),
      companySlug
    },
    success_url: successUrl,
    cancel_url: cancelUrl
  });

  console.info('[stripe setup] session created', {
    companyId: String(companyDoc._id),
    companyName: companyDoc.name || null,
    companySlug: companySlug || null,
    stripeCustomerId: customerId,
    sessionId: session.id,
    sessionUrl: session.url,
    mode: session.mode
  });

  return {
    url: session.url,
    sessionId: session.id
  };
};

const createCustomerPortalSession = async (company, returnUrl) => {
  const stripe = getStripeClient();
  const companyDoc = await toCompanyDoc(company);
  if (!companyDoc) {
    throw new Error('Company not found.');
  }
  const customerId = companyDoc?.billing?.stripeCustomerId || null;
  if (!customerId) {
    throw new Error('No Stripe customer found for this company.');
  }

  let session;
  try {
    session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: resolveReturnUrl(returnUrl)
    });
  } catch (err) {
    if (isNoSuchCustomerError(err)) {
      throw new Error('Stored Stripe customer was not found in Stripe. Start Subscription to recreate billing.');
    }
    throw err;
  }

  return session;
};

const isNoSuchSubscriptionError = (err) => {
  const message = String(err?.message || '').toLowerCase();
  return (
    message.includes('no such subscription')
    || (
      String(err?.code || '').toLowerCase() === 'resource_missing'
      && String(err?.param || '').toLowerCase() === 'subscription'
    )
  );
};

const buildSubscriptionCreateItems = (priceIds, desired) => {
  const items = [];
  if (desired.seatsBaseQty > 0) {
    items.push({ price: priceIds.seatsBase, quantity: desired.seatsBaseQty });
  }
  if (desired.seatsAdditionalQty > 0) {
    items.push({ price: priceIds.seatsAdditional, quantity: desired.seatsAdditionalQty });
  }
  if (desired.buildrootzQty > 0) {
    items.push({ price: priceIds.buildrootz, quantity: desired.buildrootzQty });
  }
  if (desired.websiteMapQty > 0) {
    items.push({ price: priceIds.websiteMap, quantity: desired.websiteMapQty });
  }
  return items;
};

const queueManagedQuantityChange = ({ updateItems, updatedItems, existingByPriceId, priceId, quantity }) => {
  const existing = existingByPriceId.get(priceId) || null;
  const desiredQty = Math.max(0, Number(quantity || 0));

  if (desiredQty > 0) {
    if (existing) {
      const oldQty = Math.max(0, Number(existing.quantity || 0));
      if (oldQty !== desiredQty) {
        updateItems.push({ id: existing.id, quantity: desiredQty });
        updatedItems.push({
          priceId,
          oldQty,
          newQty: desiredQty,
          action: 'set'
        });
      }
      return;
    }

    updateItems.push({ price: priceId, quantity: desiredQty });
    updatedItems.push({
      priceId,
      oldQty: null,
      newQty: desiredQty,
      action: 'add'
    });
    return;
  }

  if (existing) {
    const oldQty = Math.max(0, Number(existing.quantity || 0));
    updateItems.push({ id: existing.id, deleted: true });
    updatedItems.push({
      priceId,
      oldQty,
      newQty: 0,
      action: 'remove'
    });
  }
};

const syncCompanySubscriptionQuantities = async (companyId, opts = {}) => {
  if (!isStripeConfigured()) {
    return {
      skipped: true,
      reason: 'stripe_not_configured',
      noopReason: 'stripe_not_configured',
      createdCustomer: false,
      createdSubscription: false,
      updatedItems: []
    };
  }

  const stripe = getStripeClient();
  const priceIds = getStripePriceIds();
  const companyDoc = await toCompanyDoc(opts.company || companyId);
  if (!companyDoc) {
    throw new Error('Company not found.');
  }

  const quantities = await computeCompanyStripeQuantities(companyDoc);
  if (!quantities.shouldUseStripe) {
    return {
      skipped: true,
      reason: 'no_billable_items_for_stripe',
      noopReason: 'no_billable_items_for_stripe',
      createdCustomer: false,
      createdSubscription: false,
      updatedItems: [],
      quantities
    };
  }

  const desired = buildDesiredItemQuantities(quantities);
  const customerMeta = await getOrCreateCustomer(companyDoc, { includeMeta: true });
  const customerId = customerMeta.customerId;
  const resolvedPaymentMethod = await resolveCompanyDefaultPaymentMethodId({
    stripe,
    companyDoc,
    customerId
  });
  const defaultPaymentMethodId = resolvedPaymentMethod.paymentMethodId;
  const defaultPaymentMethodSource = resolvedPaymentMethod.source;
  let subscriptionId = companyDoc?.billing?.stripeSubscriptionId || null;
  let createdSubscription = false;
  const updatedItems = [];
  let resultingSubscription = null;

  if (subscriptionId) {
    try {
      resultingSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price']
      });
    } catch (err) {
      if (!isNoSuchSubscriptionError(err)) {
        throw err;
      }
      console.warn('[stripe sync] stale subscription id on company; recreating', {
        companyId: String(companyDoc._id),
        stripeSubscriptionId: subscriptionId,
        error: err?.message || err
      });
      subscriptionId = null;
      companyDoc.billing = companyDoc.billing || {};
      companyDoc.billing.stripeSubscriptionId = null;
      companyDoc.billing.stripeSubscriptionStatus = null;
      companyDoc.billing.currentPeriodEnd = null;
      companyDoc.billing.hasStripe = false;
      companyDoc.markModified('billing');
      await companyDoc.save();
    }
  }

  const desiredCreateItems = buildSubscriptionCreateItems(priceIds, desired);
  if (!subscriptionId || !resultingSubscription || ['canceled', 'incomplete_expired'].includes(resultingSubscription.status)) {
    const createPayload = {
      customer: customerId,
      items: desiredCreateItems,
      metadata: {
        companyId: String(companyDoc._id),
        companySlug: String(companyDoc.slug || companyDoc.name || '').trim()
      }
    };
    if (defaultPaymentMethodId) {
      createPayload.default_payment_method = defaultPaymentMethodId;
    }
    resultingSubscription = await stripe.subscriptions.create(createPayload);
    if (defaultPaymentMethodId) {
      console.info('[stripe sync] subscription created with default payment method', {
        companyId: String(companyDoc._id),
        stripeCustomerId: customerId,
        stripeSubscriptionId: resultingSubscription?.id || null,
        defaultPaymentMethodId,
        defaultPaymentMethodSource: defaultPaymentMethodSource || null
      });
    }
    createdSubscription = true;
    for (const item of desiredCreateItems) {
      updatedItems.push({
        priceId: item.price,
        oldQty: null,
        newQty: Number(item.quantity || 0),
        action: 'add'
      });
    }
  } else {
    const currentItems = Array.isArray(resultingSubscription?.items?.data) ? resultingSubscription.items.data : [];
    const existingByPriceId = new Map();
    for (const item of currentItems) {
      const priceId = item?.price?.id;
      if (!priceId) continue;
      existingByPriceId.set(priceId, item);
    }

    const updateItems = [];
    queueManagedQuantityChange({
      updateItems,
      updatedItems,
      existingByPriceId,
      priceId: priceIds.seatsBase,
      quantity: desired.seatsBaseQty
    });
    queueManagedQuantityChange({
      updateItems,
      updatedItems,
      existingByPriceId,
      priceId: priceIds.seatsAdditional,
      quantity: desired.seatsAdditionalQty
    });
    queueManagedQuantityChange({
      updateItems,
      updatedItems,
      existingByPriceId,
      priceId: priceIds.buildrootz,
      quantity: desired.buildrootzQty
    });
    queueManagedQuantityChange({
      updateItems,
      updatedItems,
      existingByPriceId,
      priceId: priceIds.websiteMap,
      quantity: desired.websiteMapQty
    });

    const subscriptionDefaultPaymentMethodId = getPaymentMethodId(resultingSubscription?.default_payment_method);
    const shouldSetSubscriptionDefaultPaymentMethod = !subscriptionDefaultPaymentMethodId && !!defaultPaymentMethodId;

    if (updateItems.length > 0 || shouldSetSubscriptionDefaultPaymentMethod) {
      const updatePayload = {};
      if (updateItems.length > 0) {
        updatePayload.items = updateItems;
        updatePayload.proration_behavior = 'none';
      }
      if (shouldSetSubscriptionDefaultPaymentMethod) {
        updatePayload.default_payment_method = defaultPaymentMethodId;
      }
      resultingSubscription = await stripe.subscriptions.update(resultingSubscription.id, updatePayload);
      if (shouldSetSubscriptionDefaultPaymentMethod) {
        console.info('[stripe sync] subscription default payment method set', {
          companyId: String(companyDoc._id),
          stripeCustomerId: customerId,
          stripeSubscriptionId: resultingSubscription?.id || null,
          defaultPaymentMethodId,
          defaultPaymentMethodSource: defaultPaymentMethodSource || null
        });
      }
    }
  }

  companyDoc.billing = companyDoc.billing || {};
  companyDoc.billing.stripeCustomerId = customerId;
  companyDoc.billingCustomerId = customerId;
  companyDoc.billing.stripeSubscriptionId = resultingSubscription?.id || companyDoc.billing?.stripeSubscriptionId || null;
  companyDoc.billing.lastStripeSyncAt = new Date();
  companyDoc.billing.stripeSubscriptionStatus = resultingSubscription?.status || null;
  companyDoc.billing.currentPeriodEnd = resultingSubscription?.current_period_end
    ? new Date(resultingSubscription.current_period_end * 1000)
    : null;
  if (defaultPaymentMethodId) {
    companyDoc.billing.hasPaymentMethodOnFile = true;
    companyDoc.billing.stripeDefaultPaymentMethodId = defaultPaymentMethodId;
    companyDoc.billing.stripeLastPaymentMethodCheckAt = new Date();
  }
  companyDoc.billing.hasStripe = !!companyDoc.billing.stripeSubscriptionId
    && subscriptionIsManagedActive(companyDoc.billing.stripeSubscriptionStatus);
  companyDoc.markModified('billing');
  await companyDoc.save();

  return {
    skipped: false,
    createdCustomer: !!customerMeta.created,
    createdSubscription,
    updatedItems,
    updatesApplied: updatedItems.length,
    quantities,
    desiredQuantities: desired
  };
};

module.exports = {
  assertStripeConfigured,
  isStripeConfigured,
  getStripeClient,
  getOrCreateCustomer,
  createCheckoutSessionForCompany,
  createSetupSessionForCompany,
  createCustomerPortalSession,
  syncCompanySubscriptionQuantities,
  computeCompanyStripeQuantities,
  subscriptionIsManagedActive,
  isNoSuchCustomerError
};
