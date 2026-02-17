const mongoose = require('mongoose');

const { Schema } = mongoose;

const EmailAssetSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['image'], default: 'image' },
    originalName: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    storage: {
      provider: { type: String, enum: ['local', 's3'], default: 'local' },
      key: { type: String, trim: true, required: true },
      url: { type: String, trim: true, required: true }
    },
    isArchived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

EmailAssetSchema.index({ companyId: 1, createdAt: -1 });
EmailAssetSchema.index({ companyId: 1, 'storage.key': 1 }, { unique: true });

module.exports = mongoose.model('EmailAsset', EmailAssetSchema);
