const mongoose = require('mongoose');
const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      index: true,
      required: true
    },

    // Standard field name; alias legacy `actorId`.
    actorUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
      alias: 'actorId'
    },

    action: {
      type: String,
      required: true,
      trim: true,
      index: true
    },

    // For billing-style diffs
    before: {
      type: Schema.Types.Mixed,
      default: null
    },

    after: {
      type: Schema.Types.Mixed,
      default: null
    },

    // General metadata for email/billing/system events
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
      alias: 'meta'
    }
  },
  { timestamps: true }
);

AuditLogSchema.index({ companyId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
