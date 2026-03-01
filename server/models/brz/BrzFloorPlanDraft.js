const mongoose = require('mongoose');
const BrzImageMetaSchema = require('./BrzImageMeta');

const { Schema } = mongoose;

const BrzFloorPlanDraftSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    floorPlanId: { type: Schema.Types.ObjectId, ref: 'FloorPlan', required: true, index: true },
    communityId: { type: Schema.Types.ObjectId, ref: 'Community', default: null }, // legacy field
    isIncluded: { type: Boolean, default: true },
    displayNameOverride: { type: String, default: '', trim: true },
    descriptionOverride: { type: String, default: '' },
    primaryImage: { type: BrzImageMetaSchema, default: null },
    sortOrder: { type: Number, default: 0 },
    basePriceFrom: { type: Number, default: null, min: 0 },
    basePriceAsOf: { type: Date, default: null },
    basePriceVisibility: { type: String, enum: ['hidden', 'public'], default: 'public' },
    basePriceNotesInternal: { type: String, default: '' }
  },
  { timestamps: true }
);

BrzFloorPlanDraftSchema.index({ companyId: 1, floorPlanId: 1 }, { unique: true });

module.exports = mongoose.model('BrzFloorPlanDraft', BrzFloorPlanDraftSchema);
