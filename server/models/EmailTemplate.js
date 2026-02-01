const mongoose = require('mongoose');

const { Schema } = mongoose;

const TEMPLATE_TYPES = Object.freeze({
  BLAST: 'blast',
  AUTOMATION: 'automation'
});

const EmailTemplateSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: Object.values(TEMPLATE_TYPES), default: TEMPLATE_TYPES.AUTOMATION },
    subject: { type: String, trim: true, default: '' },
    html: { type: String, trim: true, default: '' },
    text: { type: String, trim: true, default: '' },
    variables: [{ type: String, trim: true }],
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

EmailTemplateSchema.index({ companyId: 1, name: 1 }, { unique: true });
EmailTemplateSchema.index({ companyId: 1, isActive: 1, type: 1 });

const EmailTemplate = mongoose.model('EmailTemplate', EmailTemplateSchema);

EmailTemplate.TYPES = TEMPLATE_TYPES;

module.exports = EmailTemplate;
