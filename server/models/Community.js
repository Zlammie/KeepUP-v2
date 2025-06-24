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
  thirdParty: String,
  firstWalk: String,
  finalSignOff: String,
  lender: String,
  closeDateTime: String,
  listPrice: String,
  salesPrice: String
}); // disable _id for subdocuments if not needed

const CommunitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  lots: [LotSchema] // <-- Use it here
});

module.exports = mongoose.model('Community', CommunitySchema);
