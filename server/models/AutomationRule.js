const mongoose = require('mongoose');

const { Schema } = mongoose;

const TRIGGER_TYPES = Object.freeze({
  CONTACT_STATUS_CHANGED: 'contact.status.changed'
});

const ACTION_TYPES = Object.freeze({
  SEND_EMAIL: 'sendEmail'
});

const AutomationRuleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    isEnabled: { type: Boolean, default: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    trigger: {
      type: {
        type: String,
        enum: Object.values(TRIGGER_TYPES),
        required: true
      },
      config: { type: Schema.Types.Mixed, default: {} }
    },
    action: {
      type: {
        type: String,
        enum: Object.values(ACTION_TYPES),
        default: ACTION_TYPES.SEND_EMAIL
      },
      templateId: { type: Schema.Types.ObjectId, ref: 'EmailTemplate', required: true },
      delayMinutes: { type: Number, min: 0, default: 0 },
      cooldownMinutes: { type: Number, min: 0, default: 0 },
      mustStillMatchAtSend: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

AutomationRuleSchema.index({ companyId: 1, 'trigger.type': 1, isEnabled: 1 });

const AutomationRule = mongoose.model('AutomationRule', AutomationRuleSchema);

AutomationRule.TRIGGER_TYPES = TRIGGER_TYPES;
AutomationRule.ACTION_TYPES = ACTION_TYPES;

module.exports = AutomationRule;
