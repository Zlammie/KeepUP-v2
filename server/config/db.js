const mongoose = require('mongoose');

module.exports = function connectDB(uri) {
  if (!uri) throw new Error('connectDB() missing uri');
  return mongoose.connect(uri); // driver 4+ doesn’t need useNewUrlParser/useUnifiedTopology
};