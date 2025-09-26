// models/Company.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const BrandingSchema = new Schema({
  logoUrl: { type: String, default: null },     // add later in UI
  primaryColor: { type: String, default: null }, // e.g. "#0ea5e9"
  secondaryColor: { type: String, default: null }
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
  billingCustomerId: { type: String, default: null }
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
