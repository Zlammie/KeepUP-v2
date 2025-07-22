// models/priceRecord.js
const mongoose = require('mongoose');

const priceRecordSchema = new mongoose.Schema({
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: true
  },
  floorPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FloorPlanComp',
    required: true
  },
  month: {
    type: String,   // “YYYY-MM”
    required: true
  },
  price: {
    type: Number,
    required: true
  }
}, { timestamps: true });

// ensure one record per competition+floorPlan+month
priceRecordSchema.index(
  { competition: 1, floorPlan: 1, month: 1 },
  { unique: true }
);

module.exports = mongoose.model('PriceRecord', priceRecordSchema);
