const mongoose = require('mongoose');
const { Schema } = mongoose;

// ── light normalizers ──
const toLowerTrim = v => (v == null ? v : String(v).trim().toLowerCase());
const toPhone10   = v => (v ? String(v).replace(/[^\d]/g, '').slice(-10) : '');
const toNumOrNull = v => (v === '' || v == null ? null : Number(v));
const toObjectIdOrNull = v => (typeof v === 'string' && v.trim() === '' ? null : v);

// ── subdocs (kept from your current model, with a couple of nips/tucks) ──
const MonthlyPricesSchema = new Schema({
  month: { type: String, required: true, match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM'] },
  prices: { type: Map, of: Number, default: {} } // planId(str) -> price
}, { _id: false });

const MonthlyQmiSchema = new Schema({
  month: { type: String, required: true, match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM'] },
  excludedLots: [{ type: Schema.Types.ObjectId, default: [] }],
}, { _id: false });

const MonthlySalesSummarySchema = new Schema({
  month:    { type: String, required: true, match: [/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be YYYY-MM'] },
  sales:    { type: Number, default: 0 },
  cancels:  { type: Number, default: 0 },
  closings: { type: Number, default: 0 },
}, { _id: false });

const ProsConsSchema = new Schema({
  pros: [String],
  cons: [String]
}, { _id: false });

const TopPlansSchema = new Schema({
  plan1: { type: Schema.Types.ObjectId, ref: 'FloorPlan', default: null, set: toObjectIdOrNull },
  plan2: { type: Schema.Types.ObjectId, ref: 'FloorPlan', default: null, set: toObjectIdOrNull },
  plan3: { type: Schema.Types.ObjectId, ref: 'FloorPlan', default: null, set: toObjectIdOrNull },
}, { _id: false });

const CommunityCompetitionProfileSchema = new Schema({
  // 🔐 tenant scope
  company:   { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // One profile per Community (community itself is tenant-scoped)
  community: { type: Schema.Types.ObjectId, ref: 'Community', required: true, unique: true, index: true },

  // ===== Editable fields on "My Community — Competition" =====
  // Sales contact (normalize a bit)
  salesPerson:       { type: String, default: '' },
  salesPersonPhone:  { type: String, set: toPhone10, default: '' },
  salesPersonEmail:  { type: String, set: toLowerTrim, default: '' },

  // Location + model
  address: String,
  city:    String,
  state:   { type: String, default: 'TX' },
  zip:     String,

  modelPlan: String,        // keep as-is; you can wire to FloorPlan later
  lotSize:  String,

  garageType: { type: String, enum: ['Front', 'Rear'], default: undefined },

  // Schools
  schoolISD:         String,
  elementarySchool:  String,
  middleSchool:      String,
  highSchool:        String,

  // Fees / HOA / Tax (accept strings, store numbers)
  hoaFee:          { type: Number, set: toNumOrNull, default: null },
  hoaFrequency:    { type: String, default: '' }, // e.g. 'Monthly','Annually'
  tax:             { type: Number, set: toNumOrNull, default: null },
  feeTypes:        { type: [String], enum: ['MUD', 'PID', 'None'], default: [] },
  mudFee:          { type: Number, set: toNumOrNull, default: null },
  pidFee:          { type: Number, set: toNumOrNull, default: null },
  pidFeeFrequency: { type: String, enum: ['Monthly', 'Yearly', ''], default: '' },
  earnestAmount:   { type: Number, set: toNumOrNull, default: null },
  realtorCommission: { type: Number, set: toNumOrNull, default: null },
  communityAmenities: {
    type: [{
      category: { type: String, trim: true, default: '' },
      items: [{ type: String, trim: true }]
    }],
    default: []
  },

  // Marketing
  promotion: String,

  // Top plans (no dupes)
  topPlans: {
    type: TopPlansSchema,
    validate: {
      validator(v) {
        const vals = [v?.plan1, v?.plan2, v?.plan3].filter(Boolean).map(x => x.toString());
        return new Set(vals).size === vals.length;
      },
      message: 'Top plans must be unique.'
    }
  },

  prosCons: ProsConsSchema,

  // Server-computed snapshot from Community.lots (leave nullable)
  lotCounts: {
    total: Number,
    sold: Number,
    remaining: Number,
    quickMoveInLots: Number
  },

  monthlyPrices:       { type: [MonthlyPricesSchema], default: [] },
  monthlyQMI:          { type: [MonthlyQmiSchema], default: [] },
  monthlySalesSummary: { type: [MonthlySalesSummarySchema], default: [] },

  notes: String,

  // Which competitors to compare against for THIS community
  linkedCompetitions: [{ type: Schema.Types.ObjectId, ref: 'Competition' }]
}, { timestamps: true });

// ── indexes for common reads ──
CommunityCompetitionProfileSchema.index({ company: 1, community: 1 }, { unique: true }); // reinforce “one per community per tenant”
CommunityCompetitionProfileSchema.index({ company: 1, 'monthlyPrices.month': 1 });
CommunityCompetitionProfileSchema.index({ company: 1, 'monthlyQMI.month': 1 });
CommunityCompetitionProfileSchema.index({ company: 1, 'monthlySalesSummary.month': 1 });

// ── safety: ensure the community belongs to the same company ──
CommunityCompetitionProfileSchema.pre('validate', async function (next) {
  // If company not provided, or mismatched, try to derive from the community
  if (!this.community) return next();
  try {
    const Community = this.model('Community');
    const c = await Community.findById(this.community).select('company').lean();
    if (!c) return next(new Error('Community not found'));
    if (!this.company) this.company = c.company;
    if (String(this.company) !== String(c.company)) {
      return next(new Error('Community belongs to a different company'));
    }
    return next();
  } catch (e) { return next(e); }
});

module.exports = mongoose.model('CommunityCompetitionProfile', CommunityCompetitionProfileSchema);
