// models/floorPlanComp.js
const mongoose = require('mongoose');

const floorPlanSchema = new mongoose.Schema({
  competition: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Competition',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  sqft: Number,
  bed: Number,
  bath: Number,
  garage: Number,
  storyType: {
    type: String,
    enum: ['Single','Two'],
    required: true
  }
  
}, { timestamps: true });

module.exports = mongoose.model('FloorPlanComp', floorPlanSchema);
