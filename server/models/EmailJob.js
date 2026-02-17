const mongoose = require('mongoose');

const { Schema } = mongoose;

const STATUS = Object.freeze({
  QUEUED: 'queued',
  PROCESSING: 'processing',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELED: 'canceled',
  SKIPPED: 'skipped'
});

const FROM_MODES = Object.freeze({
  PLATFORM: 'platform',
  USER_VERIFIED_DOMAIN: 'user_verified_domain'
});

const EmailJobSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    to: { type: String, required: true, trim: true, lowercase: true },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact', default: null },
    realtorId: { type: Schema.Types.ObjectId, ref: 'Realtor', default: null },
    lenderId: { type: Schema.Types.ObjectId, ref: 'Lender', default: null },
    recipientType: { type: String, enum: ['contact', 'realtor'], default: 'contact' },
    templateId: { type: Schema.Types.ObjectId, ref: 'EmailTemplate', required: true },
    ruleId: { type: Schema.Types.ObjectId, ref: 'AutomationRule', default: null },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'AutoFollowUpSchedule', default: null },
    scheduleStepId: { type: String, trim: true, default: null },
    blastId: { type: Schema.Types.ObjectId, ref: 'EmailBlast', default: null },
    campaignId: { type: Schema.Types.ObjectId, default: null },
    data: { type: Schema.Types.Mixed, default: {} },
    scheduledFor: { type: Date, required: true, index: true },
    processingAt: { type: Date, default: null },
    processingBy: { type: String, default: null, trim: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.QUEUED,
      index: true
    },
    lastError: { type: String, default: null },
    provider: { type: String, default: 'mock' },
    providerMessageId: { type: String, default: null },
    senderUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    senderEmail: { type: String, default: null, trim: true, lowercase: true },
    senderName: { type: String, default: null, trim: true },
    fromMode: {
      type: String,
      enum: Object.values(FROM_MODES),
      default: FROM_MODES.PLATFORM
    },
    fromEmailUsed: { type: String, default: null, trim: true, lowercase: true },
    replyToUsed: { type: String, default: null, trim: true, lowercase: true },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

EmailJobSchema.index({ companyId: 1, status: 1, scheduledFor: 1 });
EmailJobSchema.index({ companyId: 1, status: 1, processingAt: 1 });
EmailJobSchema.index({ companyId: 1, ruleId: 1, contactId: 1, createdAt: -1 });
EmailJobSchema.index({ companyId: 1, contactId: 1, ruleId: 1, status: 1, scheduledFor: 1 });
EmailJobSchema.index({ companyId: 1, blastId: 1, createdAt: -1 });
EmailJobSchema.index({ companyId: 1, contactId: 1, scheduleId: 1, status: 1, scheduledFor: 1 });
EmailJobSchema.index({ companyId: 1, recipientType: 1, realtorId: 1, status: 1, scheduledFor: 1 });

const EmailJob = mongoose.model('EmailJob', EmailJobSchema);

EmailJob.STATUS = STATUS;
EmailJob.FROM_MODES = FROM_MODES;

module.exports = EmailJob;
