const mongoose = require('mongoose');
const { Schema } = mongoose;

// tiny coercers so old string inputs still work
const toNum = v => (v === '' || v == null ? undefined : Number(v));

const FloorPlanSchema = new Schema({
  // 🔐 tenant
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 1) human/system identifiers
  planNumber: { type: String, required: true, trim: true },
  name:       { type: String, required: true, trim: true },

  // 2) specs — coerce strings -> numbers without exploding
  specs: {
    squareFeet: { type: Number, min: 0, set: toNum, required: true },
    beds:       { type: Number, min: 0, set: toNum, required: true },
    baths:      { type: Number, min: 0, set: toNum, required: true },
    garage:     { type: Number, min: 0, set: toNum, required: true }
  },

  // 3) relationships
  // keep your existing link to which communities offer this plan
  communities: [{ type: Schema.Types.ObjectId, ref: 'Community', index: true }],

  // 4) lifecycle flags (handy in UI)
  isActive: { type: Boolean, default: true },

  // 5) assets (optional PDF + generated preview)
  asset: {
    fileUrl: { type: String, default: '' },
    previewUrl: { type: String, default: '' },
    originalFilename: { type: String, default: '' },
    mimeType: { type: String, default: '' }
  },

  // 6) elevations (name + optional asset)
  elevations: [{
    name: { type: String, default: '' },
    asset: {
      fileUrl: { type: String, default: '' },
      previewUrl: { type: String, default: '' },
      originalFilename: { type: String, default: '' },
      mimeType: { type: String, default: '' }
    },
    squareFeet: { type: Number, default: null }
  }]
}, { timestamps: true });

// 🔎 indexes
// make planNumber unique WITHIN a company (replaces global unique on planNumber)
FloorPlanSchema.index({ company: 1, planNumber: 1 }, { unique: true });
FloorPlanSchema.index({ company: 1, name: 1 });

// optional: quick search
// FloorPlanSchema.index({ name: 'text', planNumber: 'text' });

module.exports = mongoose.model('FloorPlan', FloorPlanSchema);
