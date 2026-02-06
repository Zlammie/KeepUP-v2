const mongoose = require('mongoose');

const { Schema } = mongoose;

const STATUS = Object.freeze({
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  SENDING: 'sending',
  COMPLETED: 'completed',
  CANCELED: 'canceled'
});

const EmailBlastSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    templateId: { type: Schema.Types.ObjectId, ref: 'EmailTemplate', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    requestId: { type: String, default: null, trim: true },
    audienceType: { type: String, enum: ['contacts', 'realtors'], default: 'contacts' },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.SCHEDULED
    },
    audience: {
      type: {
        type: String,
        default: 'contacts'
      },
      filters: { type: Schema.Types.Mixed, default: {} },
      snapshotCount: { type: Number, default: 0 },
      excludedCount: { type: Number, default: 0 }
    },
    schedule: {
      sendMode: { type: String, enum: ['now', 'scheduled'], default: 'now' },
      scheduledFor: { type: Date, default: null }
    },
    settingsSnapshot: {
      timezone: { type: String, default: null },
      dailyCap: { type: Number, default: null },
      rateLimitPerMinute: { type: Number, default: null }
    },
    pacingSummary: {
      firstSendAt: { type: Date, default: null },
      lastSendAt: { type: Date, default: null },
      daysSpanned: { type: Number, default: null },
      perDayPlanned: { type: Schema.Types.Mixed, default: null }
    }
  },
  { timestamps: true }
);

EmailBlastSchema.index({ companyId: 1, createdAt: -1 });
EmailBlastSchema.index({ companyId: 1, requestId: 1 }, { unique: true, sparse: true });

const EmailBlast = mongoose.model('EmailBlast', EmailBlastSchema);

EmailBlast.STATUS = STATUS;

module.exports = EmailBlast;
