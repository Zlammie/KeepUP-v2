// models/comment.js
const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Note', 'Phone', 'Email', 'Text'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  }
});

module.exports = mongoose.model('Comment', commentSchema);
