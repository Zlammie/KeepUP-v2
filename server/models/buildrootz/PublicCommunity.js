const mongoose = require('mongoose');
const { getBuildrootzConnection } = require('../../config/buildrootz');

const { Schema } = mongoose;
const conn = getBuildrootzConnection();

const FeesSchema = new Schema({
  hoaFee: { type: Number, default: null },
  hoaFrequency: { type: String, default: '' },
  tax: { type: Number, default: null },
  mudFee: { type: Number, default: null },
  pidFee: { type: Number, default: null },
  pidFeeFrequency: { type: String, default: '' },
  feeTypes: { type: [String], default: [] }
}, { _id: false });

const PublicCommunitySchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true },
  communityId: { type: Schema.Types.ObjectId, required: true, index: true }, // canonical BuildRootz community

  name: { type: String, default: '', index: true },
  slug: { type: String, default: '', index: true },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  market: { type: String, default: '' },

  builder: {
    name: { type: String, default: '' },
    slug: { type: String, default: '' }
  },
  modelAddress: {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zip: { type: String, default: '' }
  },

  promotion: { type: String, default: '' },
  description: { type: String, default: '' },
  amenities: {
    type: [{
      category: { type: String, default: '' },
      items: { type: [String], default: [] }
    }],
    default: []
  },
  fees: { type: FeesSchema, default: () => ({}) },
  heroImage: { type: String, default: '' }
}, { timestamps: true });

PublicCommunitySchema.index({ companyId: 1, communityId: 1 }, { unique: true });
PublicCommunitySchema.index({ slug: 1 });

module.exports = conn.model('PublicCommunity', PublicCommunitySchema);
