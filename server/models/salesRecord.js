const mongoose = require('mongoose');

const salesRecordSchema = new mongoose.Schema({
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: true
  },
  month: {
    type: String,   // “YYYY-MM”
    required: true
  },
  sales: {
    type: Number,
    required: true
  },
  cancels: {
    type: Number,
    required: true
  },
  closings: {
    type: Number,
    required: true
  }
}, { timestamps: true });

// one record per competition+month
salesRecordSchema.index(
  { competition: 1, month: 1 },
  { unique: true }
);

module.exports = mongoose.model('SalesRecord', salesRecordSchema);
