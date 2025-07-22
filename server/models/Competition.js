// models/competition.js
const mongoose = require('mongoose');

const competitionSchema = new mongoose.Schema({
  communityName: { type: String, required: true },
  builderName:   { type: String, required: true },
  address:       { type: String, required: true },
  city:          { type: String, required: true },
  state:          { type: String, required: true },
  zip:           { type: String, required: true },

   // ⬇️ new occasional fields
  lotSize:            { type: String },
  salesPerson:        { type: String },
  salesPersonPhone:   { type: String },
  salesPersonEmail:   { type: String },
  schoolISD:          { type: String },
  elementarySchool:   { type: String },
  middleSchool:       { type: String },
  HOA:                { type: Number },
  tax:                { type: Number },

  feeType:            {
    type: String,
     enum: ['None','MUD','PID'],
    default: ['None']
  },
  mudFee:             { type: Number },
  pidFee:             { type: Number },

  earnestAmount:      { type: Number },
  realtorCommission:  { type: Number },
  floorPlans: [{
   type: mongoose.Schema.Types.ObjectId,
   ref: 'FloorPlanComp'
 }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Competition', competitionSchema);
