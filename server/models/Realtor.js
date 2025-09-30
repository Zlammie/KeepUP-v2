const mongoose = require('mongoose');
const { Schema } = mongoose;

// normalizers so existing CSV/form strings still "just work"
const toTrim = v => (v == null ? v : String(v).trim());
const toLowerTrim = v => (v == null ? v : String(v).trim().toLowerCase());
const toPhone = v => (v ? String(v).replace(/[^\d]/g, '').slice(-10) : ''); // keep last 10 digits

const RealtorSchema = new Schema({
  // 🔐 tenant (required for RBAC scoping)
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 👤 identity
  firstName:  { type: String, set: toTrim, default: '' },
  lastName:   { type: String, set: toTrim, default: '' },

  email:      { type: String, set: toLowerTrim, default: '', index: true },
  phone:      { type: String, set: toPhone,     default: '', index: true },

  brokerage:  { type: String, set: toTrim, default: '' },

  // 🌱 optional (handy later; harmless now)
  licenseId:  { type: String, set: toTrim, default: '' },
  office:     { type: String, set: toTrim, default: '' },

  // lifecycle
  isActive:   { type: Boolean, default: true }
}, { timestamps: true });

// Convenience display
RealtorSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
});

// Unique-ish within tenant (only when provided)
RealtorSchema.index(
  { company: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $ne: '' } } }
);
RealtorSchema.index(
  { company: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string', $ne: '' } } }
);



// Helpful list lookups
RealtorSchema.index({ company: 1, lastName: 1, firstName: 1 });
RealtorSchema.index({ company: 1, brokerage: 1 });

module.exports = mongoose.model('Realtor', RealtorSchema);
