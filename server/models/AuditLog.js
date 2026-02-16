const mongoose = require('mongoose');

const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, trim: true },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

AuditLogSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
