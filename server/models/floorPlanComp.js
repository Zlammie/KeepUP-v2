// models/floorPlanComp.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// light coercers so CSV/form strings "just work"
const toNum = v => (v === '' || v == null ? undefined : Number(v));

const FloorPlanCompSchema = new Schema({
  // 🔐 tenant (derived/validated against the parent Competition)
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 🔗 parent (must be in same company)
  competition: { type: Schema.Types.ObjectId, ref: 'Competition', required: true, index: true },

  // 🏷️ identifiers
  name: { type: String, required: true, trim: true, index: true },

  // 📐 specs (accept strings; store numbers)
  sqft:   { type: Number, min: 0, set: toNum },
  bed:    { type: Number, min: 0, set: toNum },
  bath:   { type: Number, min: 0, set: toNum },
  garage: { type: Number, min: 0, set: toNum },

  storyType: { type: String, enum: ['Single', 'Two'], required: true },

  // lifecycle
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// 🚫 prevent duplicate plan names for the same competitor (within tenant)
FloorPlanCompSchema.index({ company: 1, competition: 1, name: 1 }, { unique: true });

// 🛡️ safety: ensure the parent competition exists and is in the same tenant
FloorPlanCompSchema.pre('validate', async function(next) {
  try {
    if (!this.competition) return next(new Error('competition is required'));

    const Competition = this.model('Competition');
    const comp = await Competition.findById(this.competition).select('company').lean();
    if (!comp) return next(new Error('Parent Competition not found'));

    // derive company if not set, and enforce same-tenant relationship
    if (!this.company) this.company = comp.company;
    if (String(this.company) !== String(comp.company)) {
      return next(new Error('Competition belongs to a different company'));
    }
    next();
  } catch (e) { next(e); }
});

module.exports = mongoose.model('FloorPlanComp', FloorPlanCompSchema);
