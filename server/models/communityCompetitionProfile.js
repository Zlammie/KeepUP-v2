const mongoose = require('mongoose');
const toObjectIdOrNull = v => (typeof v === 'string' && v.trim() === '' ? null : v);

const ProsConsSchema = new mongoose.Schema({
  pros: [String],
  cons: [String]
}, { _id: false });

const TopPlansSchema = new mongoose.Schema({
  plan1: { type: mongoose.Schema.Types.ObjectId, ref: 'FloorPlan', default: null, set: toObjectIdOrNull },
  plan2: { type: mongoose.Schema.Types.ObjectId, ref: 'FloorPlan', default: null, set: toObjectIdOrNull },
  plan3: { type: mongoose.Schema.Types.ObjectId, ref: 'FloorPlan', default: null, set: toObjectIdOrNull },
}, { _id: false });

const CommunityCompetitionProfileSchema = new mongoose.Schema({
  // One profile per Community
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true, unique: true },

  // ===== Editable fields on "My Community — Competition" page =====
  // Sales contact
  salesPerson: String,
  salesPersonPhone: String,
  salesPersonEmail: String,

  // Location + model
  address: String,
  city: String,
  state: { type: String, default: 'TX' },
  zip: String,

  modelPlan: String,      // placeholder; wire to plans later
  lotSize: String,        // keep string until you standardize

  garageType: { type: String, enum: ['Front', 'Rear'], default: undefined },

  // Schools
  schoolISD: String,
  elementarySchool: String,
  middleSchool: String,     // ✅ fixed spelling
  highSchool: String,

  // Fees / HOA / Tax
  hoaFee: Number,
  hoaFrequency: String,     // or enum: ['Monthly','Bi-Annually','Annually']
  tax: Number,

  feeTypes: { type: [String], enum: ['MUD', 'PID', 'None'], default: [] },
  mudFee: Number,           // ✅ single definition
  pidFee: Number,           // ✅ single definition

  earnestAmount: Number,
  realtorCommission: Number,

  // ===== Later content but included for continuity =====
  promotion: String,
 topPlans: {
  type: TopPlansSchema,
  validate: {
    validator(v) {
      const vals = [v?.plan1, v?.plan2, v?.plan3]
        .filter(Boolean)
        .map(x => x.toString());
      return new Set(vals).size === vals.length; // no dupes
    },
    message: 'Top plans must be unique.',
  }
  },
  prosCons: ProsConsSchema,

  // Server-computed from Community.lots
  lotCounts: {
    total: Number,
    sold: Number,
    remaining: Number,
    quickMoveInLots: Number
  },

  notes: String,

  // Which competitors to compare against for THIS community
  linkedCompetitions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Competition' }]
}, { timestamps: true });

module.exports = mongoose.model('CommunityCompetitionProfile', CommunityCompetitionProfileSchema);
