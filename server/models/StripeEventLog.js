const mongoose = require('mongoose');

const { Schema } = mongoose;

const StripeEventLogSchema = new Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  type: { type: String, required: true, trim: true },
  status: { type: String, enum: ['processing', 'processed', 'failed'], default: 'processing' },
  attempts: { type: Number, default: 1 },
  processedAt: { type: Date, default: null },
  lastError: { type: String, default: null },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null }
}, { timestamps: true });

module.exports = mongoose.model('StripeEventLog', StripeEventLogSchema);
