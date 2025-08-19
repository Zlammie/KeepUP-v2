// server/models/communityCompetitionProfile.js
const mongoose = require('mongoose');

const ProsConsSchema = new mongoose.Schema({
  pros: [String],
  cons: [String]
}, {_id: false});

const TopPlansSchema = new mongoose.Schema({
  plan1: String,
  plan2: String,
  plan3: String
}, {_id: false});

const CommunityCompetitionProfileSchema = new mongoose.Schema({
  community: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true, unique: true },

  // Editable fields you currently track on update-competition:
  promotion: String,
  topPlans: TopPlansSchema,
  prosCons: ProsConsSchema,

  // Optional: store summary metrics you want on the “primary” (your community)
  // You can expand this later to mirror your competition schema as needed:
  lotCounts: {
    total: Number,
    sold: Number,
    remaining: Number,
    quickMoveInLots: Number
  },

  notes: String,

  // The subset of competitors to show in comparisons for THIS community
  linkedCompetitions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Competition' }],

  // timestamps are useful for audits/versioning later
}, { timestamps: true });

module.exports = mongoose.model('CommunityCompetitionProfile', CommunityCompetitionProfileSchema);
