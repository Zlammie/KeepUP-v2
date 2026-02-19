// models/Company.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const BrandingSchema = new Schema({
  logoUrl: { type: String, default: null, trim: true },
  primaryColor: { type: String, default: null, trim: true }, // e.g. "#0ea5e9"
  secondaryColor: { type: String, default: null, trim: true }
}, { _id: false });

const AddressSchema = new Schema({
  street: { type: String, trim: true, default: null },
  city: { type: String, trim: true, default: null },
  state: { type: String, trim: true, default: null },
  zip: { type: String, trim: true, default: null }
}, { _id: false });

const PrimaryContactSchema = new Schema({
  name: { type: String, trim: true, default: null },
  email: { type: String, trim: true, lowercase: true, default: null },
  phone: { type: String, trim: true, default: null }
}, { _id: false });

const BuildrootzProfileSchema = new Schema({
  description: { type: String, trim: true, default: '' },
  logoUrl: { type: String, trim: true, default: '' },
  publishedAt: { type: Date, default: null }
}, { _id: false });

const FeatureStatusEnum = ['inactive', 'pending', 'trial', 'active'];

const BuildrootzFeatureSchema = new Schema({
  enabled: { type: Boolean, default: false },
  status: { type: String, enum: FeatureStatusEnum, default: 'inactive' }
}, { _id: false });

const WebsiteMapFeatureSchema = new Schema({
  enabled: { type: Boolean, default: false }
}, { _id: false });

const WebsiteMapEntitlementSchema = new Schema({
  freeCommunitySetups: { type: Number, default: 0 },
  trialDaysOverride: { type: Number, default: null }
}, { _id: false });

const WarmupScheduleSchema = new Schema({
  day: { type: Number, min: 1 },
  cap: { type: Number, min: 1 }
}, { _id: false });

const EmailWarmupSchema = new Schema({
  enabled: { type: Boolean, default: false },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  dayIndex: { type: Number, default: null },
  daysTotal: { type: Number, default: 14, min: 1 },
  capOverrideToday: { type: Number, default: null },
  schedule: { type: [WarmupScheduleSchema], default: undefined },
  lastComputedAt: { type: Date, default: null }
}, { _id: false });

const EntitlementsSchema = new Schema({
  websiteMap: { type: WebsiteMapEntitlementSchema, default: () => ({}) }
}, { _id: false });

const FeatureSchema = new Schema({
  buildrootz: { type: BuildrootzFeatureSchema, default: () => ({}) },
  websiteMap: { type: WebsiteMapFeatureSchema, default: () => ({}) }
}, { _id: false });

const BillingSchema = new Schema({
  seatsPurchased: { type: Number },
  stripeCustomerId: { type: String, default: null, trim: true },
  stripeSubscriptionId: { type: String, default: null, trim: true },
  stripeSubscriptionStatus: { type: String, default: null, trim: true },
  hasPaymentMethodOnFile: { type: Boolean, default: false },
  stripeDefaultPaymentMethodId: { type: String, default: null, trim: true },
  stripeLastPaymentMethodCheckAt: { type: Date, default: null },
  currentPeriodEnd: { type: Date, default: null },
  hasStripe: { type: Boolean, default: false },
  lastStripeSyncAt: { type: Date, default: null },
  stripeLastSyncAt: { type: Date, default: null },
  stripeLastSyncStatus: {
    type: String,
    enum: ['success', 'noop', 'error', null],
    default: null,
    trim: true
  },
  stripeLastSyncMessage: { type: String, default: null, trim: true },
  stripeLastSyncUpdatedItems: {
    type: [{
      priceId: { type: String, default: null, trim: true },
      oldQty: { type: Number, default: null },
      newQty: { type: Number, default: null },
      action: { type: String, default: null, trim: true }
    }],
    default: undefined
  }
}, { _id: false });

const BillingPolicySchema = new Schema({
  seats: {
    mode: { type: String, enum: ['normal', 'waived', 'internal'], default: 'normal' },
    minBilledOverride: { type: Number, default: null }
  },
  addons: {
    buildrootz: { type: String, enum: ['normal', 'comped'], default: 'normal' },
    websiteMap: { type: String, enum: ['normal', 'comped'], default: 'normal' }
  },
  notes: { type: String, trim: true, default: '' }
}, { _id: false });

const SettingsSchema = new Schema({
  timezone: { type: String, default: 'America/Chicago' },
  locale:   { type: String, default: 'en-US' },
  emailFromMode: { type: String, enum: ['platform', 'company_domain'], default: 'platform' },
  features: { type: Map, of: Boolean, default: {} }, // e.g. { contacts: true, competitions: true }
}, { _id: false });

const CompanySchema = new Schema({
  // Identity
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true }, // URL-safe handle

  // Lifecycle
  isActive: { type: Boolean, default: true },

  // Optional metadata (kept flat & flexible)
  domains: [{ type: String, lowercase: true, trim: true }], // for email-domain auth later
  plan: { type: String, default: 'free', enum: ['free','pro','enterprise'] },

  // Config & branding (safe containers you can extend anytime)
  settings: { type: SettingsSchema, default: () => ({}) },
  branding: { type: BrandingSchema, default: () => ({}) },
  // Email sending safety caps (per-company)
  emailDailyCapEnabled: { type: Boolean, default: true },
  emailDailyCap: { type: Number, default: 500, min: 0 },
  emailDomainVerifiedAt: { type: Date, default: null },
  emailWarmup: { type: EmailWarmupSchema, default: null },
  // Deliverability protection (per-company)
  emailSendingPaused: { type: Boolean, default: false },
  emailSendingPausedAt: { type: Date, default: null },
  emailSendingPausedBy: { type: Schema.Types.Mixed, default: null },
  emailSendingPausedReason: {
    type: String,
    enum: ['spamreport', 'bounce_rate', 'manual'],
    default: null
  },
  emailSendingPausedMeta: { type: Schema.Types.Mixed, default: null },
  emailAutoPauseOnSpamReport: { type: Boolean, default: true },
  emailAutoPauseOnBounceRate: { type: Boolean, default: true },
  emailBounceRateThreshold: { type: Number, default: 0.05, min: 0, max: 1 },
  emailBounceMinSentForEvaluation: { type: Number, default: 50, min: 0 },

  // Listing map status colors (status key -> hex color)
  mapStatusPalette: {
    type: Map,
    of: String,
    default: {}
  },

  // Billing hooks (fill in when/if you adopt a provider)
  billingCustomerId: { type: String, default: null },
  billing: { type: BillingSchema, default: () => ({}) },
  billingPolicy: { type: BillingPolicySchema, default: () => ({}) },
  features: { type: FeatureSchema, default: () => ({}) },
  entitlements: { type: EntitlementsSchema, default: () => ({}) },

  // Company profile + admin-only notes
  address: { type: AddressSchema, default: () => ({}) },
  primaryContact: { type: PrimaryContactSchema, default: () => ({}) },
  notes: { type: String, trim: true, default: '' },
  updatedByUserId: { type: Schema.Types.ObjectId, default: null },

  // BuildRootz profile content (builder-facing)
  buildrootzProfile: { type: BuildrootzProfileSchema, default: () => ({}) }
}, { timestamps: true });

// Helper: auto-generate slug from name on create (don't clobber if provided)
CompanySchema.pre('validate', function(next) {
  if (!this.slug && this.name) {
    this.slug = String(this.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }
  next();
});

// Useful indexes for lookups
// Useful indexes for lookups (slug is already unique via the field definition)
CompanySchema.index({ isActive: 1 });
CompanySchema.index({ 'billing.stripeCustomerId': 1 });
CompanySchema.index({ 'billing.stripeSubscriptionId': 1 });

module.exports = mongoose.model('Company', CompanySchema);
