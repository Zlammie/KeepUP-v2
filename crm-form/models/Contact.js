const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  status: String,
  source: String,
  investor: Boolean,
  owner: String,
   communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community'
  },
  linkedLot: {
    jobNumber: String,
    address: String,
    lot: String,
    block: String,
    phase: String
  },Date: String,
  lotLineUp: String,
  realtor: { type: mongoose.Schema.Types.ObjectId, ref: 'Realtor' },
   lenders: [
    {
      lender: { type: mongoose.Schema.Types.ObjectId, ref: 'Lender' },
      status: {
        type: String,
        enum: [
          'invite',
          'subApplication',
          'subDocs',
          'missingDocs',
          'approved',
          'cannotQualify'
        ],
        lowercase: true,
      },
      inviteDate: String,
      approvedDate: String
    }
  ],
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }]
});
module.exports = mongoose.model('Contact', contactSchema);
