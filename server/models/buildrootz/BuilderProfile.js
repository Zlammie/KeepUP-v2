const mongoose = require('mongoose');
const { getBuildrootzConnection } = require('../../config/buildrootz');

const { Schema } = mongoose;
const conn = getBuildrootzConnection();

const BuilderProfileSchema = new Schema({
  companyId: { type: Schema.Types.ObjectId, index: true, unique: true, required: true },
  name: { type: String, default: '', index: true },
  slug: { type: String, default: '', index: true },
  logoUrl: { type: String, default: '' },
  websiteUrl: { type: String, default: '' },
  description: { type: String, default: '' },
  publishedAt: { type: Date, default: null }
}, { timestamps: true });

BuilderProfileSchema.index({ slug: 1 }, { unique: false });

module.exports = conn.model('BuilderProfile', BuilderProfileSchema);
