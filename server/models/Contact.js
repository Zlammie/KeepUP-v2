// server/models/Contact.js
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { normalizePhoneForDb } = require('../utils/phone');
const lenderStatusValues = ['invite','submittedapplication','subdocs','missingdocs','approved','cannotqualify'];
const toDateOrNull = v => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const n = Number(v);
  if (!Number.isNaN(n) && n > 59_000) {
    const base = new Date(Date.UTC(1899, 11, 30));
    return new Date(base.getTime() + n * 86400000);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const toLenderStatus = (v) => {
  const normalized = (v ?? '').toString().trim().toLowerCase();
  return normalized && lenderStatusValues.includes(normalized) ? normalized : 'invite';
};

function normEmail(v) {
  const t = (v || '').trim().toLowerCase();
  return t || null;
}


/**
 * Contact (master identity per company)
 * - Tenant scoped by `company`
 * - NOT per-user/per-community context (put that in ContactAssignment)
 * - Can be related to many communities via `communityIds` (union tag)
 */

const ContactSchema = new Schema(
  {
    // ── Tenant / provenance ────────────────────────────────────────────────────
    company:   { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

    // Optional: who created the contact (audit only; do not use for visibility)
    ownerId:   { type: Schema.Types.ObjectId, ref: 'User', index: true }, // optional now

    // ── Communities (union of all communities this identity is tied to) ────────
    communityIds: [{ type: Schema.Types.ObjectId, ref: 'Community', index: true }],

    // ── Identity fields (used for dedupe) ──────────────────────────────────────
    firstName: { type: String, trim: true },
    lastName:  { type: String, trim: true },
    email:     { type: String, lowercase: true, trim: true, index: true },
    phone:     { type: String, set: v => normalizePhoneForDb(v).phone },
    visitDate:  { type: Date, set: toDateOrNull, default: null },
    source:    { type: String, trim: true },
    lotLineUp:  { type: String, trim: true },
    buyTime:    { type: String, trim: true },
    buyMonth:   { type: String, trim: true },
    facing:     [{ type: String, trim: true }],
    living:     [{ type: String, trim: true }],

    emailNorm: { type: String, index: true },
    phoneNorm: { type: String, index: true },

    floorplans: [{ type: Schema.Types.ObjectId, ref: 'FloorPlan', index: true }],

    investor:      { type: Boolean, default: false },
    renting:       { type: Boolean, default: false },
    ownSelling:    { type: Boolean, default: false },
    ownNotSelling: { type: Boolean, default: false },

    // ── Legacy / transitional fields (per-user/per-community context) ─────────
    // NOTE: Keep these for now so current pages don’t break; migrate them into
    // ContactAssignment (userId + communityId scoped) and remove later.
    status:    {
      type: String,
      enum: [
        'New','Target','Possible','Negotiation','Be-Back','Cold',
        'Purchased','Closed','Not-Interested','Deal-Lost','Bust'
      ],
      default: 'New'
    },
    notes:           { type: String, trim: true },
    realtorId:       { type: Schema.Types.ObjectId, ref: 'Realtor' },
    lenderId:        { type: Schema.Types.ObjectId, ref: 'Lender' },
    lotId:           { type: Schema.Types.ObjectId, ref: 'Lot' },
    lenderStatus:    { type: String, enum: ['Invite','Submitted Application','Submitted Docs','Missing Docs','Approved','Cannot Qualify'] },
    lenderInviteDate:{ type: Date },
    lenderApprovedDate:{ type: Date },

    lenders: [{
      lender: { type: Schema.Types.ObjectId, ref: 'Lender', required: true },
      status: { type: String, enum: lenderStatusValues, default: 'invite', set: toLenderStatus },
      inviteDate: { type: Date, default: null },
      approvedDate: { type: Date, default: null },
      closingStatus: {
        type: String,
        enum: ['notLocked','locked','underwriting','clearToClose'],
        default: 'notLocked'
      },
      closingDateTime: { type: Date, set: toDateOrNull, default: null },
      isPrimary: { type: Boolean, default: false }
    }],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// ── Virtuals (compat + display) ───────────────────────────────────────────────

// Back-compat alias: some code may still do populate('realtor') / ('lender')
ContactSchema.virtual('realtor', {
  ref: 'Realtor',
  localField: 'realtorId',
  foreignField: '_id',
  justOne: true
});

ContactSchema.virtual('lender', {
  ref: 'Lender',
  localField: 'lenderId',
  foreignField: '_id',
  justOne: true
});

// Display communities from the array
ContactSchema.virtual('communities', {
  ref: 'Community',
  localField: 'communityIds',
  foreignField: '_id',
  justOne: false
});

// Convenience full name
ContactSchema.virtual('fullName').get(function () {
  const a = (this.firstName || '').trim();
  const b = (this.lastName || '').trim();
  return [a, b].filter(Boolean).join(' ');
});

// Back-compat for old single `communityId` usage (setter writes to array)
ContactSchema.virtual('communityId')
  .get(function () {
    return Array.isArray(this.communityIds) && this.communityIds.length ? this.communityIds[0] : null;
  })
  .set(function (v) {
    if (!v) { this.communityIds = []; return; }
    const arr = Array.isArray(v) ? v : [v];
    const uniq = [...new Set(arr.map(x => x.toString()))];
    this.communityIds = uniq;
  });

// ── Indexes (dedupe per tenant + common lookups) ─────────────────────────────

// Unique email per company (allow blank/absent)
ContactSchema.index(
  { company: 1, email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string', $ne: '' } } }
);

// Unique phone per company (allow blank/absent)
ContactSchema.index(
  { company: 1, phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string', $ne: '' } } }
);

// Helpful query indexes
ContactSchema.index({ company: 1, lastName: 1, firstName: 1 });
ContactSchema.index({ company: 1, updatedAt: -1 });

// Keep communityIds de-duped even on direct updates
ContactSchema.pre('save', function (next) {
  if (Array.isArray(this.communityIds)) {
    this.communityIds = [...new Set(this.communityIds.map(id => id.toString()))];
  }
  if (Array.isArray(this.floorplans)) {
    this.floorplans = [...new Set(this.floorplans.map(id => id.toString()))];
  }
  // NEW: keep normalized fields in sync
  this.emailNorm = normEmail(this.email);
  const phoneNormalized = normalizePhoneForDb(this.phone);
  this.phone = phoneNormalized.phone;
  this.phoneNorm = phoneNormalized.phoneNorm;
  next();
});

function applyNormsToUpdate(u) {
  if (!u) return u;
  const $set = u.$set || {};
  if (Object.prototype.hasOwnProperty.call($set, 'email')) {
    $set.emailNorm = normEmail($set.email);
  }
  if (Object.prototype.hasOwnProperty.call($set, 'phone')) {
    const normalized = normalizePhoneForDb($set.phone);
    $set.phone = normalized.phone;
    $set.phoneNorm = normalized.phoneNorm;
  }
  u.$set = $set;
  return u;
}
ContactSchema.pre('updateOne', function(next){ this.setUpdate(applyNormsToUpdate(this.getUpdate())); next(); });
ContactSchema.pre('findOneAndUpdate', function(next){ this.setUpdate(applyNormsToUpdate(this.getUpdate())); next(); });
ContactSchema.pre('updateMany', function(next){ this.setUpdate(applyNormsToUpdate(this.getUpdate())); next(); });

ContactSchema.index(
  { company: 1, emailNorm: 1 },
  { unique: true, partialFilterExpression: { emailNorm: { $type: 'string', $ne: '' } } }
);
ContactSchema.index(
  { company: 1, phoneNorm: 1 },
  { unique: true, partialFilterExpression: { phoneNorm: { $type: 'string', $ne: '' } } }
);

module.exports = mongoose.model('Contact', ContactSchema);
