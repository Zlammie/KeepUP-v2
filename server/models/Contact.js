const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  visitDate: { type: Date, default: null },
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
    buyTime:    { type: String,   default: '' },
    buyMonth:   { type: String,   default: '' },
    facing:     [String],                   // array of selected facings
    renting:    { type: Boolean,  default: false },
    ownSelling: { type: Boolean,  default: false },
    ownNotSelling: { type: Boolean, default: false },
    floorplans: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'FloorPlan' }
      ],
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
        default: 'invite'   // ← add this
      },
      inviteDate:  { type: Date, default: null },
      approvedDate:{ type: Date, default: null },
      isPrimary: { type: Boolean, default: false },
        closingStatus: {
      type: String,
      enum: ['notLocked','locked','underwriting','clearToClose'],
      default: 'notLocked'
    },
    closingDateTime: {
      type: Date,
      default: null
    }
      
    }
  ],
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }]
});
module.exports = mongoose.model('Contact', contactSchema);
