const mongoose = require('mongoose');

const { Schema } = mongoose;

const BrzPublishedSnapshotSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    builderSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
    version: { type: Number, required: true, min: 1, index: true },
    publishedAt: { type: Date, required: true, default: Date.now, index: true },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

BrzPublishedSnapshotSchema.index({ builderSlug: 1, version: 1 }, { unique: true });
BrzPublishedSnapshotSchema.index({ builderSlug: 1, version: -1 });

module.exports = mongoose.model('BrzPublishedSnapshot', BrzPublishedSnapshotSchema);
