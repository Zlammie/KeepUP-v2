const mongoose = require('mongoose');

const realtorSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  brokerage: String
}, { timestamps: true });

module.exports = mongoose.model('Realtor', realtorSchema);