// models/FloorPlan.js
const mongoose = require('mongoose');

const FloorPlanSchema = new mongoose.Schema({
  // 1️⃣ Floor Plan #: a unique code or number
  planNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  // 2️⃣ Floor Plan Name
  name: {
    type: String,
    required: true,
    trim: true
  },

  // 3️⃣ Specs: square footage and counts
  specs: {
    squareFeet: {
      type: Number,
      required: true,
      min: 0
    },
    beds: {
      type: Number,
      required: true,
      min: 0
    },
    baths: {
      type: Number,
      required: true,
      min: 0
    },
    garage: {
      type: Number,
      required: true,
      min: 0
    }
  },

  // Optional: which communities offer this plan
  communities: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'Community' }
  ]
}, {
  timestamps: true
});

module.exports = mongoose.model('FloorPlan', FloorPlanSchema);
