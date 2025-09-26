// models/comment.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const commentSchema = new Schema({
  // 🔐 tenant
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 🎯 optional secondary scope (lets you filter quickly by a community)
  communityId: { type: Schema.Types.ObjectId, ref: 'Community', index: true },

  // 🧭 who/what this is about
  contact: { type: Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },

  // ✍️ author (optional but useful for audits)
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', index: true },

  // 📝 the comment itself
  type: { type: String, enum: ['Note', 'Phone', 'Email', 'Text'], required: true },
  content: { type: String, required: true },

  // ⏱️
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

// Helpful compound indexes for list views
commentSchema.index({ company: 1, contact: 1, timestamp: -1 });
commentSchema.index({ company: 1, communityId: 1, timestamp: -1 });

// Optional: text index for search
// commentSchema.index({ content: 'text' });

module.exports = mongoose.model('Comment', commentSchema);
