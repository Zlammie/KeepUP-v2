// models/competition.js
const mongoose = require('mongoose');



const competitionSchema = new mongoose.Schema({
  communityName: { type: String, required: true },
  builderName:   { type: String, required: true },
  address:       { type: String, required: true },
  city:          { type: String, required: true },
  state: { type: String, required: true, default: 'TX' },
  zip:           { type: String, required: true },
  builderWebsite: {
    type: String,
    default: ''
  },
   // ⬇️ new occasional fields
  lotSize:            { type: String },
  salesPerson:        { type: String },
  salesPersonPhone:   { type: String },
  salesPersonEmail:   { type: String },
  schoolISD:          { type: String },
  elementarySchool:   { type: String },
  middleSchool:       { type: String },
  highSchool:         { type: String },
  hoaFee: {
  type: Number,
  default: null
},
hoaFrequency: {
  type: String,
  enum: ['Monthly', 'Bi-Annually', 'Annually', null],
  default: null
},
  tax:                { type: Number },
  modelPlan:          { type:String},
  garageType: {
  type: String,
  enum: ['Front', 'Rear'],
  default: null
},
totalLots: {
  type: Number,
  default: 0
},

feeTypes: {
  type: [String],
  enum: ['MUD', 'PID', 'None'],
  default: []
},
mudFee: {
  type: Number,
  default: null
},
pidFee: {
  type: Number,
  default: null
},
pidFeeFrequency: {
  type: String,
  enum: ['Monthly', 'Yearly', null],
  default: null
},

  earnestAmount:      { type: Number },
  realtorCommission:  { type: Number },
  floorPlans: [{
   type: mongoose.Schema.Types.ObjectId,
   ref: 'FloorPlanComp'
 }],
 communityAmenities: [{
  category: String,
  items: [String]
}],
promotion: {
  type: String,
  default: ''
},

topPlan1: { type: String },
topPlan2: { type: String },
topPlan3: { type: String },

pros: { type: [String], default: [] },
cons: { type: [String], default: [] },

monthlyMetrics: [{
  month: String, // e.g., "2025-07"
  soldLots: { type: Number, default: 0 },
  quickMoveInLots: { type: Number, default: 0 }
}],

communityRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', default: null }

}, {
  timestamps: true
});

module.exports = mongoose.model('Competition', competitionSchema);
