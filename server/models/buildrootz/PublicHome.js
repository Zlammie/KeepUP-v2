const mongoose = require('mongoose');
const { getBuildrootzConnection } = require('../../config/buildrootz');

const { Schema } = mongoose;
const conn = getBuildrootzConnection();

const AddressSchema = new Schema({
  street: { type: String, default: '' },
  city:   { type: String, default: '' },
  state:  { type: String, default: '' },
  zip:    { type: String, default: '' },
  lat:    { type: Number, default: null },
  lng:    { type: Number, default: null }
}, { _id: false });

const SpecsSchema = new Schema({
  beds:   { type: Number, default: null },
  baths:  { type: Number, default: null },
  sqft:   { type: Number, default: null },
  garage: { type: Number, default: null }
}, { _id: false });

const PublicHomeSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, index: true },
  communityId: { type: Schema.Types.ObjectId, index: true },
  buildrootzCommunityId: { type: Schema.Types.ObjectId, index: true, default: null },
  sourceHomeId: { type: Schema.Types.Mixed, required: true, index: true },

  title: { type: String, default: '' },
  slug:  { type: String, default: '', index: true },
  status: { type: String, default: '' },

  address: { type: AddressSchema, default: () => ({}) },
  price: { type: Number, default: null },
  salesPrice: { type: Number, default: null },
  publishedAt: { type: Date, default: null },

  plan: {
    name: { type: String, default: '' },
    planNumber: { type: String, default: '' }
  },

  specs: { type: SpecsSchema, default: () => ({}) },

  community: {
    name: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    slug: { type: String, default: '' }
  },

  builder: {
    name: { type: String, default: '' },
    slug: { type: String, default: '' }
  },

  salesContact: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' }
  },

  modelAddress: {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    zip: { type: String, default: '' }
  },

  lotSize: { type: String, default: '' },

  description: { type: String, default: '' },
  highlights:  { type: String, default: '' },

  fees: {
    hoaFee: { type: Number, default: null },
    hoaFrequency: { type: String, default: '' },
    tax: { type: Number, default: null },
    mudFee: { type: Number, default: null },
    pidFee: { type: Number, default: null },
    pidFeeFrequency: { type: String, default: '' },
    feeTypes: { type: [String], default: [] }
  },

  amenities: {
    type: [{
      category: { type: String, default: '' },
      items: { type: [String], default: [] }
    }],
    default: []
  },

  images: { type: [String], default: [] },
  floorPlanMedia: {
    type: [{
      url: { type: String, default: '' },
      label: { type: String, default: '' },
      type: { type: String, default: 'image' }
    }],
    default: []
  },

  incentives: { type: [String], default: [] },

  elevationImage: { type: String, default: '' },

  schools: {
    isd: { type: String, default: '' },
    elementary: { type: String, default: '' },
    middle: { type: String, default: '' },
    high: { type: String, default: '' }
  },

  coordinates: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },

  meta: {
    publishVersion: { type: Number, default: 0 },
    sourceUpdatedAt: { type: Date, default: null }
  }
}, { timestamps: true });

PublicHomeSchema.index({ companyId: 1, sourceHomeId: 1 }, { unique: true });
PublicHomeSchema.index({ slug: 1 });

module.exports = conn.model('PublicHome', PublicHomeSchema);
