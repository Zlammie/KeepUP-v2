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

const SettingsSchema = new Schema({
  timezone: { type: String, default: 'America/Chicago' },
  locale:   { type: String, default: 'en-US' },
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

  // Billing hooks (fill in when/if you adopt a provider)
  billingCustomerId: { type: String, default: null },

  // Company profile + admin-only notes
  address: { type: AddressSchema, default: () => ({}) },
  primaryContact: { type: PrimaryContactSchema, default: () => ({}) },
  notes: { type: String, trim: true, default: '' }
}, { timestamps: true });

// Helper: auto-generate slug from name on create (don’t clobber if provided)
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

module.exports = mongoose.model('Company', CompanySchema);
