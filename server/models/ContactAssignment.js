const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * ContactAssignment (a.k.a. ContactLink / Engagement)
 * Ties one Contact to one User + one Community inside a Company,
 * and holds the per-user/per-community context (notes, status, lot, etc.)
 */
const ContactAssignmentSchema = new Schema({
  company:    { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  contactId:  { type: Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
  userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  communityId:{ type: Schema.Types.ObjectId, ref: 'Community', required: true, index: true },

  // Context that differs per user/community:
  status:     { type: String, enum: ['New','Target','Possible','Negotiation','Be-Back','Cold','Purchased','Closed'], default: 'New' },
  notes:      { type: String, trim: true },

  // Optional context you already track:
  lotId:      { type: Schema.Types.ObjectId, ref: 'Lot' },
  realtorId:  { type: Schema.Types.ObjectId, ref: 'Realtor' },
  lenderId:   { type: Schema.Types.ObjectId, ref: 'Lender' },

  lenderStatus:       { type: String, enum: ['Invite','Submitted Application','Submitted Docs','Missing Docs','Approved','Cannot Qualify'] },
  lenderInviteDate:   { type: Date },
  lenderApprovedDate: { type: Date },
}, { timestamps: true });

// Prevent duplicate links: the same user assigning the same contact to the same community twice.
ContactAssignmentSchema.index(
  { company: 1, contactId: 1, userId: 1, communityId: 1 },
  { unique: true }
);

// Helpful query paths
ContactAssignmentSchema.index({ company: 1, userId: 1, updatedAt: -1 });
ContactAssignmentSchema.index({ company: 1, communityId: 1, updatedAt: -1 });

// (Optional but recommended) Safety: ensure all foreign refs belong to the same company
ContactAssignmentSchema.pre('save', async function nextHook(next) {
  try {
    const ids = { company: this.company, contactId: this.contactId, userId: this.userId, communityId: this.communityId };
    // If you want strict tenant matching at write time, you can check here with 4 parallel finds.
    // Skipping implementation for brevity; rely on server-side assignment instead (see controller).
    return next();
  } catch (e) { return next(e); }
});

module.exports = mongoose.model('ContactAssignment', ContactAssignmentSchema);
