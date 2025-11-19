const mongoose = require('mongoose');

const { Schema } = mongoose;

const SCHEDULE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED'
});

const AUTO_COMPLETE_RULES = Object.freeze({
  MANUAL: 'MANUAL',
  ON_REPLY: 'ON_REPLY',
  AFTER_DUE: 'AFTER_DUE'
});

const FOLLOW_UP_CHANNELS = Object.freeze([
  'SMS',
  'EMAIL',
  'CALL',
  'MEETING',
  'REMINDER',
  'TASK',
  'NOTE'
]);

const FollowUpStepSchema = new Schema(
  {
    stepId: {
      type: String,
      default: () => new mongoose.Types.ObjectId().toString()
    },
    order: { type: Number, min: 0, default: 0 },
    dayOffset: { type: Number, min: 0, required: true },
    channel: {
      type: String,
      enum: FOLLOW_UP_CHANNELS,
      required: true
    },
    title: { type: String, trim: true, required: true },
    instructions: { type: String, trim: true },
    ownerRole: { type: String, trim: true },
    waitForReply: { type: Boolean, default: false },
    autoCompleteRule: {
      type: String,
      enum: Object.values(AUTO_COMPLETE_RULES),
      default: AUTO_COMPLETE_RULES.MANUAL
    },
    templateRef: {
      type: Schema.Types.ObjectId,
      ref: 'ContentTemplate',
      default: null
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null
    }
  },
  { _id: false }
);

const AutoFollowUpScheduleSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    summary: { type: String, trim: true },
    description: { type: String, trim: true },
    stage: { type: String, trim: true },
    defaultOwnerRole: { type: String, trim: true },
    fallbackOwnerRole: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: Object.values(SCHEDULE_STATUS),
      default: SCHEDULE_STATUS.DRAFT,
      index: true
    },
    version: { type: Number, default: 1 },
    lastPublishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    steps: {
      type: [FollowUpStepSchema],
      default: [],
      validate: {
        validator(steps) {
          if (!Array.isArray(steps)) return false;
          if (this.status === SCHEDULE_STATUS.DRAFT) return true;
          return steps.length > 0;
        },
        message: 'Active schedules must contain at least one follow-up step.'
      }
    },
    metadata: { type: Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

AutoFollowUpScheduleSchema.index({ company: 1, name: 1 }, { unique: true });
AutoFollowUpScheduleSchema.index({ company: 1, status: 1, stage: 1 });

AutoFollowUpScheduleSchema.virtual('totalTouchpoints').get(function totalTouchpoints() {
  return Array.isArray(this.steps) ? this.steps.length : 0;
});

AutoFollowUpScheduleSchema.virtual('durationDays').get(function durationDays() {
  if (!Array.isArray(this.steps) || !this.steps.length) return 0;
  const maxOffset = Math.max(...this.steps.map((step) => step.dayOffset || 0));
  return Math.max(0, maxOffset);
});

AutoFollowUpScheduleSchema.set('toObject', { virtuals: true });
AutoFollowUpScheduleSchema.set('toJSON', { virtuals: true });

const AutoFollowUpSchedule = mongoose.model('AutoFollowUpSchedule', AutoFollowUpScheduleSchema);

AutoFollowUpSchedule.STATUS = SCHEDULE_STATUS;
AutoFollowUpSchedule.STEP_CHANNELS = FOLLOW_UP_CHANNELS;
AutoFollowUpSchedule.AUTO_COMPLETE_RULES = AUTO_COMPLETE_RULES;

module.exports = AutoFollowUpSchedule;
