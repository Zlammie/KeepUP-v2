// models/PriceRecord.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// helpers
const isYYYYMM = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

const PriceRecordSchema = new Schema({
  // 🔐 tenant scope (derived from parent Competition)
  company:    { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 🔗 parents (must be in same tenant)
  competition:{ type: Schema.Types.ObjectId, ref: 'Competition',   required: true, index: true },
  floorPlan:  { type: Schema.Types.ObjectId, ref: 'FloorPlanComp', required: true, index: true },

  // 📅 key
  month: {
    type: String,  // "YYYY-MM"
    required: true,
    validate: { validator: isYYYYMM, message: 'month must be in YYYY-MM format' },
    index: true
  },

  // 💲 value
  price: { type: Number, required: true, min: 0 }
}, { timestamps: true });

// enforce uniqueness *within a tenant*
PriceRecordSchema.index({ company: 1, competition: 1, floorPlan: 1, month: 1 }, { unique: true });

// Safety: ensure parents exist and belong to the same tenant; derive company
PriceRecordSchema.pre('validate', async function nextHook(next) {
  try {
    if (!this.competition || !this.floorPlan) return next(new Error('competition and floorPlan are required'));

    const Competition = this.model('Competition');
    const FloorPlanComp = this.model('FloorPlanComp');

    const [comp, fp] = await Promise.all([
      Competition.findById(this.competition).select('company').lean(),
      FloorPlanComp.findById(this.floorPlan).select('company competition').lean()
    ]);

    if (!comp) return next(new Error('Competition not found'));
    if (!fp)   return next(new Error('FloorPlanComp not found'));
    if (String(fp.competition) !== String(this.competition)) {
      return next(new Error('FloorPlanComp does not belong to the specified Competition'));
    }

    // derive company and assert same-tenant relationship
    if (!this.company) this.company = comp.company;
    if (String(this.company) !== String(comp.company) || String(this.company) !== String(fp.company)) {
      return next(new Error('Cross-tenant reference detected'));
    }
    next();
  } catch (e) { next(e); }
});

module.exports = mongoose.models.PriceRecord
  || mongoose.model('PriceRecord', PriceRecordSchema);
