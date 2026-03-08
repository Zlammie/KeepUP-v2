const mongoose = require('mongoose');

const { Schema } = mongoose;

const REASONS = Object.freeze({
  UNSUBSCRIBED: 'unsubscribed',
  BOUNCE: 'bounce',
  SPAMREPORT: 'spamreport',
  MANUAL: 'manual'
});

const SuppressionSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    reason: { type: String, enum: Object.values(REASONS), default: REASONS.MANUAL }
  },
  { timestamps: true }
);

SuppressionSchema.index({ companyId: 1, email: 1 }, { unique: true });

const Suppression = mongoose.model('Suppression', SuppressionSchema);

Suppression.REASONS = REASONS;

module.exports = Suppression;
