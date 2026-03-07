const mongoose = require('mongoose');
const { Schema } = mongoose;

const BrzPublishAuditScopeSchema = new Schema(
  {
    communityIdsCount: { type: Number, min: 0, default: 0 },
    lotIdsCount: { type: Number, min: 0, default: 0 },
    communityIdsSample: [{ type: String, trim: true }],
    lotIdsSample: [{ type: String, trim: true }]
  },
  { _id: false }
);

const BrzPublishAuditResultSchema = new Schema(
  {
    publishedCount: { type: Number, min: 0 },
    deactivatedCount: { type: Number, min: 0 },
    skippedCount: { type: Number, min: 0 }
  },
  { _id: false }
);

const BrzPublishAuditInitiatorSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    source: {
      type: String,
      enum: ['user', 'system', 'unknown'],
      default: 'unknown'
    },
    route: { type: String, trim: true, maxlength: 240, default: '' }
  },
  { _id: false }
);

const BrzPublishAuditSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    kind: {
      type: String,
      enum: ['inventory'],
      default: 'inventory',
      required: true
    },
    mode: {
      type: String,
      enum: ['PATCH', 'RECONCILE'],
      required: true
    },
    scope: {
      type: BrzPublishAuditScopeSchema,
      default: () => ({})
    },
    meta: {
      unpublishMissingHomes: { type: Boolean, default: false }
    },
    result: {
      type: BrzPublishAuditResultSchema,
      default: () => ({})
    },
    warningsCount: {
      type: Number,
      min: 0,
      default: 0
    },
    warningsSample: [{
      type: String,
      trim: true,
      maxlength: 180
    }],
    message: {
      type: String,
      trim: true,
      maxlength: 240,
      default: ''
    },
    initiator: {
      type: BrzPublishAuditInitiatorSchema,
      default: () => ({})
    }
  },
  { versionKey: false }
);

BrzPublishAuditSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('BrzPublishAudit', BrzPublishAuditSchema);
