const mongoose = require('mongoose');
const { Schema } = mongoose;

// light normalizers
const toLowerTrim = v => (v == null ? v : String(v).trim().toLowerCase());
const toPhone10   = v => (v ? String(v).replace(/[^\d]/g, '').slice(-10) : '');
const toNumOrNull = v => (v === '' || v == null ? null : Number(v));

const MonthlyMetricsSchema = new Schema({
  month: { type: String, required: true, match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM'] },
  soldLots:       { type: Number, default: 0 },
  quickMoveInLots:{ type: Number, default: 0 }
}, { _id: false });

const CompetitionSchema = new Schema({
  // 🔐 Tenant
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 🏘️ Basic identifiers
  communityName: { type: String, required: true, trim: true },
  builderName:   { type: String, required: true, trim: true },
  address:       { type: String, required: true, trim: true },
  city:          { type: String, required: true, trim: true },
  state:         { type: String, required: true, default: 'TX', trim: true },
  zip:           { type: String, required: true, trim: true },

  builderWebsite: { type: String, default: '' },

  // 🔑 Attributes
  lotSize:          { type: String },
  salesPerson:      { type: String },
  salesPersonPhone: { type: String, set: toPhone10 },
  salesPersonEmail: { type: String, set: toLowerTrim },

  schoolISD:        { type: String },
  elementarySchool: { type: String },
  middleSchool:     { type: String },
  highSchool:       { type: String },

  modelPlan:        { type: String, default: '' },
  garageType:       { type: String, enum: ['Front','Rear', null], default: null },

  // 💸 Fees
  hoaFee:         { type: Number, set: toNumOrNull, default: null },
  hoaFrequency:   { type: String, enum: ['Monthly','Bi-Annually','Annually', null], default: null },
  tax:            { type: Number, set: toNumOrNull, default: null },
  feeTypes:       { type: [String], enum: ['MUD','PID','None'], default: [] },
  mudFee:         { type: Number, set: toNumOrNull, default: null },
  pidFee:         { type: Number, set: toNumOrNull, default: null },
  pidFeeFrequency:{ type: String, enum: ['Monthly','Yearly', null], default: null },

  earnestAmount:    { type: Number, set: toNumOrNull, default: null },
  realtorCommission:{ type: Number, set: toNumOrNull, default: null },

  // 🏗️ Linked data
  floorPlans: [{ type: Schema.Types.ObjectId, ref: 'FloorPlanComp', index: true }],
  communityAmenities: [{
    category: String,
    items: [String]
  }],

  // 📈 Marketing
  promotion: { type: String, default: '' },
  topPlan1:  { type: String },
  topPlan2:  { type: String },
  topPlan3:  { type: String },

  pros: { type: [String], default: [] },
  cons: { type: [String], default: [] },

  // 📊 Time series
  monthlyMetrics: { type: [MonthlyMetricsSchema], default: [] },

  // 🔗 Back-ref to our own Community (optional)
  communityRef: { type: Schema.Types.ObjectId, ref: 'Community', default: null }
}, { timestamps: true });

// indexes for common lookups
CompetitionSchema.index({ company: 1, builderName: 1, communityName: 1 });
CompetitionSchema.index({ company: 1, city: 1, state: 1 });
CompetitionSchema.index({ company: 1, 'monthlyMetrics.month': 1 });

module.exports = mongoose.model('Competition', CompetitionSchema);
