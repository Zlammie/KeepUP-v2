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
const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const WebsiteMapSchema = new Schema({
  status: { type: String, enum: ['inactive', 'trial', 'active'], default: 'inactive' },
  trialEndsAt: { type: Date, set: toDateOrNull, default: null },
  setupFeeApplied: { type: Boolean, default: false }
}, { _id: false });

const LotSchema = new Schema({
  jobNumber: { type: String, index: true },
  lot: String,
  block: String,
  phase: String,

  address: String,

  floorPlan: { type: Schema.Types.ObjectId, ref: 'FloorPlan', default: null },
  elevation: String,
  buildingStatus: String,

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

  // Earnest money tracking
  earnestAmount: { type: Number, set: toNumOrNull, default: null },
  earnestAdditionalAmount: { type: Number, set: toNumOrNull, default: null },
  earnestCollectedDate: { type: Date, set: toDateOrNull, default: null },
  earnestTotal: { type: Number, set: toNumOrNull, default: null },
  earnestEntries: [{
    amount: { type: Number, set: toNumOrNull, default: null },
    dueDate: { type: Date, set: toDateOrNull, default: null },
    collectedDate: { type: Date, set: toDateOrNull, default: null }
  }],

  lender: String,

  // If you truly need date + time, store as Date
  closeDateTime: { type: Date, set: toDateOrNull, default: null },

  // Prices — accept strings, store numbers
  listPrice:  { type: Number, set: toNumOrNull, default: null },
  salesPrice: { type: Number, set: toNumOrNull, default: null },

  // Listing content (scaffold + BuildRootz publish metadata)
  hasViewHomeLink: { type: Boolean, default: false },
  isPublished:        { type: Boolean, default: false },
  isListed:           { type: Boolean, default: false },
  buildrootz: {
    isPublished: { type: Boolean, default: false }
  },
  publishedAt:        { type: Date, default: null },
  contentSyncedAt:    { type: Date, set: toDateOrNull, default: null },
  buildrootzId:       { type: Schema.Types.Mixed, default: null },
  publishVersion:     { type: Number, default: 0 },
  promoText:          { type: String, default: '' },
  listingDescription: { type: String, default: '' },
  heroImage:          { type: String, default: '' },
  listingPhotos:      [{ type: String, default: undefined }],
  liveElevationPhoto: { type: String, default: '' },
  salesContactName:   { type: String, default: '' },
  salesContactPhone:  { type: String, default: '' },
  salesContactEmail:  { type: String, default: '' },
  latitude:           { type: Number, set: toNumOrNull, default: null },
  longitude:          { type: Number, set: toNumOrNull, default: null },

  // BuildRootz publish metadata
  buildrootzCommunityId: { type: Schema.Types.Mixed, default: null },
  buildrootzCanonicalName: { type: String, default: '' },
  buildrootzLastPublishStatus: { type: String, default: '' },
  buildrootzLastPublishError: { type: String, default: '' }
}, { _id: true });

const CommunitySchema = new Schema({
  // 🔐 Tenant
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 📛 Identity
  name: { type: String, required: true, index: true },
  slug: { type: String, default: '', index: true, lowercase: true, trim: true, set: slugify },

  // (optional but handy for filters/graphs)
  market: String,
  city:   String,
  state:  String,

  // BuildRootz canonical mapping (prevents duplicate community records)
  buildrootz: {
    communityId:    { type: Schema.Types.Mixed, default: null },
    publicCommunityId: { type: String },
    canonicalName:  { type: String, default: '' },
    mappedAt:       { type: Date, default: null },
    mappedByUserId: { type: Schema.Types.ObjectId, default: null },
    request: {
      requestId:        { type: String, default: null },
      status:           { type: String, default: null },
      requestedName:    { type: String, default: '' },
      requestedAt:      { type: Date, default: null },
      lastCheckedAt:    { type: Date, default: null },
      resolvedCommunityId: { type: String, default: null },
      resolvedPublicCommunityId: { type: String, default: null },
      resolvedAt:       { type: Date, default: null },
      rejectedReason:   { type: String, default: '' }
    }
  },
  websiteMap: { type: WebsiteMapSchema, default: () => ({}) },
  updatedByUserId: { type: Schema.Types.ObjectId, default: null },

  // Listing map plan colors (plan class -> hex color)
  planPalette: {
    type: Map,
    of: String,
    default: {}
  },

  // Lots
  lots: [LotSchema]
}, { timestamps: true });

// ——— Useful indexes ———
// speed up list views & filters
CommunitySchema.index({ company: 1, name: 1 }, { unique: false });
CommunitySchema.index({ company: 1, city: 1, name: 1 });
CommunitySchema.index({ company: 1, slug: 1 });
CommunitySchema.index({ company: 1, 'lots.generalStatus': 1 });
CommunitySchema.index({ company: 1, 'lots.releaseDate': -1 });

// (Optional) text search on name/city/market
// CommunitySchema.index({ name: 'text', city: 'text', market: 'text' });

CommunitySchema.pre('validate', function setCommunitySlug(next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name);
  }
  next();
});

module.exports = mongoose.model('Community', CommunitySchema);
