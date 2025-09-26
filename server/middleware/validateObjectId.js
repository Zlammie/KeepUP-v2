const mongoose = require('mongoose');
module.exports = (paramName = 'id') => (req, res, next) => {
  const val = req.params[paramName];
  if (!mongoose.Types.ObjectId.isValid(val)) {
    return res.status(400).json({ error: `Invalid ${paramName}` });
  }
  next();
};
