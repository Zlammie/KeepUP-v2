const mongoose = require("mongoose");

const lenderSchema = new mongoose.Schema({
  lenderBrokerage: String,
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  visitDate: String
});

module.exports = mongoose.model("Lender", lenderSchema);
