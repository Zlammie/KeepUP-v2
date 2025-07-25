// models/quickMoveIn.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const quickMoveInSchema = new Schema({
  competition: {
    type: Schema.Types.ObjectId,
    ref: 'Competition',
    required: true
  },
  month: {
    type: String,    // “YYYY-MM”
    required: true
  },
  address: {
    type: String,
    required: true
  },
  floorPlan: {
    type: Schema.Types.ObjectId,
    ref: 'FloorPlanComp',
    required: true
  },
  listPrice: {
    type: Number,
    required: true
  },
  sqft: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: [
      'Ready Now','SOLD',
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ],
    required: true
  },
  listDate: {
    type: Date,
    required: true
  },
  soldDate:    { type: Date }          // ← new optional field
}, { timestamps: true });

// ensure one record per competition+month+address
quickMoveInSchema.index(
  { competition: 1, month: 1, address: 1 },
  { unique: true }
);

module.exports = mongoose.model('QuickMoveIn', quickMoveInSchema);
