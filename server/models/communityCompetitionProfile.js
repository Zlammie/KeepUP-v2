const mongoose = require('mongoose');

const ProsConsSchema = new mongoose.Schema({
  pros: [String],
  cons: [String]
}, { _id: false });

const TopPlansSchema = new mongoose.Schema({
  plan1: String,
  plan2: String,
  plan3: String
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
  topPlans: TopPlansSchema,
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
