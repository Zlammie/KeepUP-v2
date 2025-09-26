const mongoose = require('mongoose');
const { Schema } = mongoose;

// helpers
const isYYYYMM = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const toNum = v => (v === '' || v == null ? undefined : Number(v));

const QuickMoveInSchema = new Schema({
  // 🔐 tenant (derived from parent Competition)
  company:     { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 🔗 parents (must be same tenant)
  competition: { type: Schema.Types.ObjectId, ref: 'Competition',   required: true, index: true },
  floorPlan:   { type: Schema.Types.ObjectId, ref: 'FloorPlanComp', required: true, index: true },

  // 📅 period key
  month: {
    type: String, // "YYYY-MM"
    required: true,
    validate: { validator: isYYYYMM, message: 'month must be YYYY-MM' },
    index: true
  },

  // 🏠 listing info
  address:   { type: String, required: true, trim: true },
  listPrice: { type: Number, required: true, min: 0, set: toNum },
  sqft:      { type: Number, required: true, min: 0, set: toNum },

  // timeline
  listDate:  { type: Date, required: true },
  soldDate:  { type: Date, default: null },
  soldPrice: { type: Number, default: null, min: 0, set: toNum },

  // status (keep your existing enum values)
  status: {
    type: String,
    enum: [
      'Ready Now','SOLD',
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ],
    required: true
  },

  // soft lifecycle
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

// Uniqueness *within tenant*: a given address can only appear once per month per competition in a company
QuickMoveInSchema.index(
  { company: 1, competition: 1, month: 1, address: 1 },
  { unique: true }
);

// Safety: derive company & prevent cross-tenant/cross-parent mismatches
QuickMoveInSchema.pre('validate', async function(next) {
  try {
    if (!this.competition || !this.floorPlan) {
      return next(new Error('competition and floorPlan are required'));
    }
    const Competition   = this.model('Competition');
    const FloorPlanComp = this.model('FloorPlanComp');

    const [comp, fp] = await Promise.all([
      Competition.findById(this.competition).select('company').lean(),
      FloorPlanComp.findById(this.floorPlan).select('company competition').lean()
    ]);

    if (!comp) return next(new Error('Competition not found'));
    if (!fp)   return next(new Error('FloorPlanComp not found'));

    // floorPlan must belong to the same competition
    if (String(fp.competition) !== String(this.competition)) {
      return next(new Error('FloorPlanComp does not belong to the specified Competition'));
    }

    // derive tenant and enforce same-company
    if (!this.company) this.company = comp.company;
    const cid = String(this.company);
    if (cid !== String(comp.company) || cid !== String(fp.company)) {
      return next(new Error('Cross-tenant reference detected'));
    }
    return next();
  } catch (e) {
    return next(e);
  }
});

module.exports = mongoose.model('QuickMoveIn', QuickMoveInSchema);
