const mongoose = require('mongoose');

const { Schema } = mongoose;

const FeatureRequestSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    feature: { type: String, enum: ['buildrootz', 'websiteMap'], required: true, index: true },
    communityId: { type: Schema.Types.ObjectId, ref: 'Community', default: null, index: true },
    status: { type: String, enum: ['pending', 'approved', 'denied'], default: 'pending', index: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

FeatureRequestSchema.index({ companyId: 1, feature: 1, communityId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('FeatureRequest', FeatureRequestSchema);
