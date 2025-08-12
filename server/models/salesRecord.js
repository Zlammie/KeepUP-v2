// models/salesRecord.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const salesRecordSchema = new Schema({
  competition: { type: Schema.Types.ObjectId, ref: 'Competition', required: true },
  month:       { type: String, required: true }, // 'YYYY-MM'
  sales:       { type: Number, default: 0, min: 0 },
  cancels:     { type: Number, default: 0, min: 0 },
  closings:    { type: Number, default: 0, min: 0 },
}, { timestamps: true });

salesRecordSchema.index({ competition: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('SalesRecord', salesRecordSchema);
