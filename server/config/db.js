const mongoose = require('mongoose');

module.exports = function connectDB(uri) {
  return mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
};