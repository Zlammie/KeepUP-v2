const mongoose = require('mongoose');
const User = require('../models/User');

const getSeatCounts = async (companyId) => {
  if (!mongoose.Types.ObjectId.isValid(String(companyId || ''))) {
    throw new Error('Invalid company context');
  }
  const companyObjectId = new mongoose.Types.ObjectId(companyId);

  const [active, invited, total] = await Promise.all([
    User.countDocuments({
      company: companyObjectId,
      status: User.STATUS.ACTIVE,
      isActive: { $ne: false }
    }),
    User.countDocuments({
      company: companyObjectId,
      status: User.STATUS.INVITED
    }),
    User.countDocuments({
      company: companyObjectId
    })
  ]);

  const disabled = Math.max(0, total - active - invited);

  return {
    active,
    invited,
    disabled,
    total
  };
};

module.exports = {
  getSeatCounts
};
