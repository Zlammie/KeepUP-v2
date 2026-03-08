const mongoose = require('mongoose');
const BrzImageMetaSchema = require('./BrzImageMeta');

const { Schema } = mongoose;

const BrzBuilderProfileDraftSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    builderSlug: { type: String, required: true, default: '', trim: true, lowercase: true, index: true },
    displayNameOverride: { type: String, default: '', trim: true },
    shortDescription: { type: String, default: '' },
    longDescription: { type: String, default: '' },
    heroImage: { type: BrzImageMetaSchema, default: null },
    ctaLinks: { type: Schema.Types.Mixed, default: {} },
    pricingDisclaimer: { type: String, default: '' }
  },
  { timestamps: true }
);

BrzBuilderProfileDraftSchema.index({ companyId: 1 }, { unique: true });

module.exports = mongoose.model('BrzBuilderProfileDraft', BrzBuilderProfileDraftSchema);
