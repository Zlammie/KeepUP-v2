const mongoose = require('mongoose');

const { Schema } = mongoose;

const STATUS = Object.freeze({
  NOT_STARTED: 'not_started',
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
  REMOVED: 'removed'
});

const DnsRecordSchema = new Schema(
  {
    type: { type: String, default: '', trim: true },
    host: { type: String, default: '', trim: true },
    value: { type: String, default: '', trim: true },
    // data is deprecated; keep for backward compatibility
    data: { type: String, default: '', trim: true },
    purpose: { type: String, default: '', trim: true }
  },
  { _id: false }
);

const ValidationSchema = new Schema(
  {
    valid: { type: Boolean, default: null },
    results: { type: Schema.Types.Mixed, default: {} },
    checkedAt: { type: Date, default: null }
  },
  { _id: false }
);

const CompanyEmailDomainSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true, index: true },
    domain: { type: String, required: true, trim: true, lowercase: true },
    subdomain: { type: String, default: 'email', trim: true, lowercase: true },
    linkBranding: { type: Boolean, default: true },
    sendgridDomainId: { type: String, default: null },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.NOT_STARTED
    },
    dnsRecords: { type: [DnsRecordSchema], default: [] },
    lastValidation: { type: ValidationSchema, default: () => ({}) },
    verifiedAt: { type: Date, default: null },
    lastValidatedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

CompanyEmailDomainSchema.index({ companyId: 1, status: 1 });

const CompanyEmailDomain = mongoose.model('CompanyEmailDomain', CompanyEmailDomainSchema);

CompanyEmailDomain.STATUS = STATUS;

module.exports = CompanyEmailDomain;
