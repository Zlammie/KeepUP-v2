const mongoose = require('mongoose');
const { Schema } = mongoose;

// helpers
const isYYYYMM = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

const SalesRecordSchema = new Schema({
  // 🔐 tenant scope (derived from parent Competition)
  company:     { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 🔗 parent (must be same tenant)
  competition: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },

  // 📅 key
  month: {
    type: String, // "YYYY-MM"
    required: true,
    validate: { validator: isYYYYMM, message: 'month must be in YYYY-MM format' },
    index: true
  },

  // 📊 metrics (keep your fields; allow numbers only)
  sales:    { type: Number, default: 0, min: 0 },
  cancels:  { type: Number, default: 0, min: 0 },
  closings: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

// Uniqueness within a tenant (replaces global unique)
SalesRecordSchema.index({ company: 1, competition: 1, month: 1 }, { unique: true });

// Safety: derive company from Competition & prevent cross-tenant refs
SalesRecordSchema.pre('validate', async function(next) {
  try {
    if (!this.competition) return next(new Error('competition is required'));
    const Competition = this.model('Competition');
    const comp = await Competition.findById(this.competition).select('company').lean();
    if (!comp) return next(new Error('Competition not found'));
    if (!this.company) this.company = comp.company;
    if (String(this.company) !== String(comp.company)) {
      return next(new Error('Cross-tenant reference detected'));
    }
    next();
  } catch (e) { next(e); }
});

module.exports = mongoose.model('SalesRecord', SalesRecordSchema);
