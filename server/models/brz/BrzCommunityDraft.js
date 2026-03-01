const mongoose = require('mongoose');
const BrzImageMetaSchema = require('./BrzImageMeta');

const { Schema } = mongoose;

const BrzCommunityDraftSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    communityId: { type: Schema.Types.ObjectId, ref: 'Community', required: true, index: true },
    isIncluded: { type: Boolean, default: true },
    displayNameOverride: { type: String, default: '', trim: true },
    descriptionOverride: { type: String, default: '' },
    heroImage: { type: BrzImageMetaSchema, default: null },
    sortOrder: { type: Number, default: 0 },
    competitionWebData: { type: Schema.Types.Mixed, default: null },
    competitionPromotion: { type: String, default: '' },
    draftSyncedAt: { type: Date, default: null },
    draftSyncedFrom: { type: String, enum: ['competition', null], default: null }
  },
  { timestamps: true }
);

BrzCommunityDraftSchema.index({ companyId: 1, communityId: 1 }, { unique: true });

module.exports = mongoose.model('BrzCommunityDraft', BrzCommunityDraftSchema);
