console.log('Loading Community schema from:', __filename);

const mongoose = require('mongoose');

const LotSchema = new mongoose.Schema({
  jobNumber: String,
  lot: String,
  block: String,
  phase: String,
  address: String,
  floorPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FloorPlan',
    default: null
  },
  elevation: String,
  status: String,
  purchaser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  },
  phone: String,
  email: String,
  releaseDate: String,
  expectedCompletionDate: String,
  closeMonth: String,
  walkStatus: {
  type: String,
  enum: [
    'waitingOnBuilder',
    'datesSentToPurchaser',
    'datesConfirmed',
    'thirdPartyComplete',
    'firstWalkComplete',
    'finalSignOffComplete'
  ],
  default: 'waitingOnBuilder'
},
  thirdParty:      { type: Date, default: null },
  firstWalk:       { type: Date, default: null },
  finalSignOff:    { type: Date, default: null },
  lender: String,
  closeDateTime: String,
  listPrice: String,
  salesPrice: String,
  salesDate: { type: Date, default: null } 
  
}); // disable _id for subdocuments if not needed

const CommunitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  lots: [LotSchema] // <-- Use it here
});

module.exports = mongoose.model('Community', CommunitySchema);
