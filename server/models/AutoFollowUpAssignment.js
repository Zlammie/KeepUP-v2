const mongoose = require('mongoose');

const { Schema } = mongoose;

const ASSIGNMENT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
});

const AssignmentSettingsSchema = new Schema(
  {
    stage: { type: String, trim: true },
    autoStart: { type: Boolean, default: true },
    startOffsetDays: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true }
  },
  { _id: false }
);

const AssignmentCursorSchema = new Schema(
  {
    stepIndex: { type: Number, min: 0, default: 0 },
    stepId: { type: String, trim: true },
    dueAt: { type: Date },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    lastCompletedAt: { type: Date, default: null }
  },
  { _id: false }
);

const AssignmentAuditSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, required: true, trim: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    payload: { type: Schema.Types.Mixed, default: null }
  },
  { _id: false }
);

const AutoFollowUpAssignmentSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    schedule: {
      type: Schema.Types.ObjectId,
      ref: 'AutoFollowUpSchedule',
      required: true,
      index: true
    },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: Object.values(ASSIGNMENT_STATUS),
      default: ASSIGNMENT_STATUS.ACTIVE,
      index: true
    },
    appliedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    appliedAt: { type: Date, default: Date.now },
    startedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    settings: { type: AssignmentSettingsSchema, default: () => ({}) },
    cursor: { type: AssignmentCursorSchema, default: () => ({}) },
    metrics: {
      totalSteps: { type: Number, min: 0, default: 0 },
      completedSteps: { type: Number, min: 0, default: 0 },
      skippedSteps: { type: Number, min: 0, default: 0 }
    },
    auditLog: { type: [AssignmentAuditSchema], default: [] }
  },
  { timestamps: true }
);

AutoFollowUpAssignmentSchema.index(
  { company: 1, user: 1, schedule: 1 },
  { unique: true, name: 'uniq_company_user_schedule' }
);
AutoFollowUpAssignmentSchema.index({ company: 1, status: 1 });

AutoFollowUpAssignmentSchema.set('toObject', { virtuals: true });
AutoFollowUpAssignmentSchema.set('toJSON', { virtuals: true });

const AutoFollowUpAssignment = mongoose.model(
  'AutoFollowUpAssignment',
  AutoFollowUpAssignmentSchema
);

AutoFollowUpAssignment.STATUS = ASSIGNMENT_STATUS;

module.exports = AutoFollowUpAssignment;
