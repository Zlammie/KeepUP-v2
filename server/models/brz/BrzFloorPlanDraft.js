const mongoose = require('mongoose');
const BrzImageMetaSchema = require('./BrzImageMeta');

const { Schema } = mongoose;

const BrzFloorPlanDraftSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    floorPlanId: { type: Schema.Types.ObjectId, ref: 'FloorPlan', required: true, index: true },
    communityId: { type: Schema.Types.ObjectId, ref: 'Community', required: true, index: true },
    isIncluded: { type: Boolean, default: true },
    displayNameOverride: { type: String, default: '', trim: true },
    descriptionOverride: { type: String, default: '' },
    primaryImage: { type: BrzImageMetaSchema, default: null },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

BrzFloorPlanDraftSchema.index({ companyId: 1, floorPlanId: 1 }, { unique: true });
BrzFloorPlanDraftSchema.index({ companyId: 1, communityId: 1 });

module.exports = mongoose.model('BrzFloorPlanDraft', BrzFloorPlanDraftSchema);
