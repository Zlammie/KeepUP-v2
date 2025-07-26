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
  mudFee:             { type: Number },
  pidFee:             { type: Number },

  earnestAmount:      { type: Number },
  realtorCommission:  { type: Number },
  floorPlans: [{
   type: mongoose.Schema.Types.ObjectId,
   ref: 'FloorPlanComp'
 }],
 communityAmenities: [{
  category: String,
  items: [String]
}]
}, {
  timestamps: true
});

module.exports = mongoose.model('Competition', competitionSchema);
