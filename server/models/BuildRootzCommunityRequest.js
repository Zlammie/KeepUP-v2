// models/BuildRootzCommunityRequest.js
const mongoose = require('mongoose');

const { Schema } = mongoose;

const BuildRootzCommunityRequestSchema = new Schema(
  {
    keepupCommunityId: { type: Schema.Types.ObjectId, ref: 'Community', required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    requestedName: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'approved', 'linked', 'rejected'],
      default: 'pending',
      index: true
    },
    submittedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    submittedAt: { type: Date, default: Date.now },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    decision: {
      type: String,
      enum: ['create', 'link', 'reject'],
      default: null
    },
    resolvedBuildRootzCommunityId: { type: String, default: '' },
    resolvedCanonicalName: { type: String, default: '' },
    rejectedReason: { type: String, default: '' },
    buildrootzCreatePayload: { type: Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

BuildRootzCommunityRequestSchema.index({ companyId: 1, status: 1, submittedAt: -1 });

module.exports = mongoose.model('BuildRootzCommunityRequest', BuildRootzCommunityRequestSchema);
