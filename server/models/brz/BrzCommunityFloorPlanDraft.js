const mongoose = require('mongoose');
const BrzImageMetaSchema = require('./BrzImageMeta');

const { Schema } = mongoose;

const BrzCommunityFloorPlanDraftSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    communityId: { type: Schema.Types.ObjectId, ref: 'Community', required: true, index: true },
    floorPlanId: { type: Schema.Types.ObjectId, ref: 'FloorPlan', required: true, index: true },
    isIncluded: { type: Boolean, default: true },
    basePriceFrom: { type: Number, default: null, min: 0 },
    basePriceAsOf: { type: Date, default: null },
    basePriceVisibility: { type: String, enum: ['hidden', 'public'], default: 'public' },
    basePriceNotesInternal: { type: String, default: '' },
    descriptionOverride: { type: String, default: '' },
    primaryImageOverride: { type: BrzImageMetaSchema, default: null },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

BrzCommunityFloorPlanDraftSchema.index(
  { companyId: 1, communityId: 1, floorPlanId: 1 },
  { unique: true }
);
BrzCommunityFloorPlanDraftSchema.index({ companyId: 1, communityId: 1 });
BrzCommunityFloorPlanDraftSchema.index({ companyId: 1, floorPlanId: 1 });

module.exports = mongoose.model('BrzCommunityFloorPlanDraft', BrzCommunityFloorPlanDraftSchema);
