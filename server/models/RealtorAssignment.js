const mongoose = require('mongoose');
const { Schema } = mongoose;

const RealtorAssignmentSchema = new Schema({
  company:   { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  userId:    { type: Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
  realtorId: { type: Schema.Types.ObjectId, ref: 'Realtor', required: true, index: true },
  nickname:  { type: String, trim: true, default: '' },
  notes:     { type: String, trim: true, default: '' },
  isFavorite:{ type: Boolean, default: false },
  lastUsedAt:{ type: Date },
}, { timestamps: true });

RealtorAssignmentSchema.index({ company: 1, userId: 1, realtorId: 1 }, { unique: true });
RealtorAssignmentSchema.index({ company: 1, userId: 1, updatedAt: -1 });

module.exports = mongoose.model('RealtorAssignment', RealtorAssignmentSchema);
