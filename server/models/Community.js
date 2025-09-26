// models/Community.js
console.log('Loading Community schema from:', __filename);

const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

// ——— helpers: safe coercion without blowing up old string data ———
const toNumOrNull = v => (v === '' || v == null ? null : Number(v));
const toDateOrNull = v => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const LotSchema = new Schema({
  jobNumber: { type: String, index: true },
  lot: String,
  block: String,
  phase: String,

  address: String,

  floorPlan: { type: Schema.Types.ObjectId, ref: 'FloorPlan', default: null },
  elevation: String,

  // Build/status tracking
  status: String, // (legacy)
  generalStatus: {
    type: String,
    enum: ['Available', 'SPEC', 'Sold', 'Closed', 'Coming Soon', 'Model', 'Hold'],
    default: 'Available',
    index: true
  },

  // Purchaser linkage (optional)
  purchaser: { type: Schema.Types.ObjectId, ref: 'Contact', default: null },
  phone: String,
  email: String,

  // Key dates — accept strings, store as Date when possible
  releaseDate: {
    type: Date,
    set: toDateOrNull,
    default: null,
    index: true
  },
  expectedCompletionDate: {
    type: Date,
    set: toDateOrNull,
    default: null,
    index: true
  },
  closeMonth: { type: String, default: null }, // keep as string 'YYYY-MM' if you use it that way
  salesDate: { type: Date, default: null },

  // Walk workflow
  walkStatus: {
    type: String,
    enum: [
      'waitingOnBuilder',
      'datesSentToPurchaser',
      'datesConfirmed',
      'thirdPartyComplete',
      'firstWalkComplete',
      'finalSignOffComplete'
    ],
    default: 'waitingOnBuilder'
  },
  thirdParty:   { type: Date, default: null },
  firstWalk:    { type: Date, default: null },
  finalSignOff: { type: Date, default: null },

  lender: String,

  // If you truly need date + time, store as Date
  closeDateTime: { type: Date, set: toDateOrNull, default: null },

  // Prices — accept strings, store numbers
  listPrice:  { type: Number, set: toNumOrNull, default: null },
  salesPrice: { type: Number, set: toNumOrNull, default: null },
}, { _id: true });

const CommunitySchema = new Schema({
  // 🔐 Tenant
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 📛 Identity
  name: { type: String, required: true, index: true },

  // (optional but handy for filters/graphs)
  market: String,
  city:   String,
  state:  String,

  // Lots
  lots: [LotSchema]
}, { timestamps: true });

// ——— Useful indexes ———
// speed up list views & filters
CommunitySchema.index({ company: 1, name: 1 }, { unique: false });
CommunitySchema.index({ company: 1, city: 1, name: 1 });
CommunitySchema.index({ company: 1, 'lots.generalStatus': 1 });
CommunitySchema.index({ company: 1, 'lots.releaseDate': -1 });

// (Optional) text search on name/city/market
// CommunitySchema.index({ name: 'text', city: 'text', market: 'text' });

module.exports = mongoose.model('Community', CommunitySchema);
