const mongoose = require('mongoose');

const { Schema } = mongoose;

const EmailEventSchema = new Schema(
  {
    provider: { type: String, default: 'sendgrid', index: true },
    event: { type: String, required: true, index: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'EmailJob', default: null, index: true },
    blastId: { type: Schema.Types.ObjectId, ref: 'EmailBlast', default: null },
    ruleId: { type: Schema.Types.ObjectId, ref: 'AutomationRule', default: null },
    recipientId: { type: Schema.Types.ObjectId, default: null },
    recipientType: { type: String, default: null },
    providerMessageId: { type: String, default: null, index: true },
    sgEventId: { type: String, default: null, index: true },
    dedupeKey: { type: String, default: null, index: true },
    eventAt: { type: Date, default: null },
    reason: { type: String, default: null },
    status: { type: String, default: null },
    response: { type: String, default: null },
    customArgs: { type: Schema.Types.Mixed, default: {} },
    raw: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

EmailEventSchema.index({ provider: 1, event: 1, eventAt: -1 });
EmailEventSchema.index({ companyId: 1, event: 1, eventAt: -1 });
EmailEventSchema.index({ companyId: 1, event: 1, createdAt: -1 });
EmailEventSchema.index(
  { provider: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

module.exports = mongoose.model('EmailEvent', EmailEventSchema);
