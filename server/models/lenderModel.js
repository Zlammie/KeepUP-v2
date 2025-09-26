const mongoose = require('mongoose');
const { Schema } = mongoose;

// light normalizers so existing CSV/form strings "just work"
const toDateOrNull = v => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const n = Number(v);
  if (!Number.isNaN(n) && n > 59_000) { // Excel serial-ish
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + n * 86400000);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const toPhone = v => (v ? String(v).replace(/[^\d]/g, '').slice(-10) : ''); // keep last 10
const toLowerTrim = v => (v == null ? v : String(v).trim().toLowerCase());
const toTrim = v => (v == null ? v : String(v).trim());

const LenderSchema = new Schema({
  // 🔐 tenant (REQUIRED for scoping)
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 🧾 details
  lenderBrokerage: { type: String, set: toTrim, default: '' }, // keep your original field name
  firstName:       { type: String, set: toTrim, default: '' },
  lastName:        { type: String, set: toTrim, default: '' },

  email:           { type: String, set: toLowerTrim, default: '', index: true },
  phone:           { type: String, set: toPhone,     default: '', index: true },

  // was String in your model; store as Date while accepting strings/serials
  visitDate:       { type: Date, set: toDateOrNull, default: null },

  // lifecycle / categorization
  type:     { type: String, enum: ['lender','broker','loanOfficer','other'], default: 'lender' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// 📚 convenience virtual
LenderSchema.virtual('fullName').get(function () {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
});

// 🧭 unique-ish constraints *within a company*
// allow multiple lenders with empty email/phone; enforce uniqueness when present
LenderSchema.index(
  { company: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $ne: '' } } }
);
LenderSchema.index(
  { company: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string', $ne: '' } } }
);

// helpful lookups for lists
LenderSchema.index({ company: 1, lastName: 1, firstName: 1 });
LenderSchema.index({ company: 1, lenderBrokerage: 1 });

module.exports = mongoose.model('Lender', LenderSchema);
