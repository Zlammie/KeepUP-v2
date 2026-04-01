const mongoose = require('mongoose');

const { Schema } = mongoose;

const SIGNUP_REQUEST_STATUSES = Object.freeze({
  PENDING: 'pending',
  CONTACTED: 'contacted',
  APPROVED: 'approved',
  DENIED: 'denied'
});

const SignupRequestSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    companyName: { type: String, default: '', trim: true },
    workEmail: { type: String, required: true, trim: true, lowercase: true, index: true },
    phone: { type: String, required: true, trim: true },
    salesTeamSize: { type: String, required: true, trim: true },
    interestedProducts: { type: [String], default: [] },
    termsAccepted: { type: Boolean, default: false },
    termsAcceptedAt: { type: Date, default: null },
    termsVersion: { type: String, default: '', trim: true },
    privacyVersion: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: Object.values(SIGNUP_REQUEST_STATUSES),
      default: SIGNUP_REQUEST_STATUSES.PENDING,
      index: true
    },
    notes: { type: String, default: '', trim: true },
    submittedAt: { type: Date, default: Date.now, index: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
    adminUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    provisionedAt: { type: Date, default: null },
    provisionedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lastInviteSentAt: { type: Date, default: null }
  },
  { timestamps: true }
);

SignupRequestSchema.index({ workEmail: 1, status: 1, submittedAt: -1 });

const SignupRequest = mongoose.models.SignupRequest || mongoose.model('SignupRequest', SignupRequestSchema);

SignupRequest.STATUS = SIGNUP_REQUEST_STATUSES;

module.exports = SignupRequest;
