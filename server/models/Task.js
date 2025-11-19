const mongoose = require('mongoose');

const { Schema } = mongoose;

const TASK_TYPES = Object.freeze([
  'Follow-Up',
  'Call',
  'Email',
  'Meeting',
  'Reminder',
  'Document',
  'Approval',
  'Review',
  'Data Fix',
  'System Suggestion',
  'Admin',
  'Custom'
]);

const TASK_CATEGORIES = Object.freeze([
  'Sales',
  'Operations',
  'Communication',
  'System',
  'Admin',
  'Custom'
]);

const TASK_PRIORITIES = Object.freeze(['Low', 'Medium', 'High']);

const TASK_STATUS = Object.freeze(['Pending', 'In Progress', 'Completed', 'Overdue']);

const LINKED_MODELS = Object.freeze([
  'Contact',
  'Realtor',
  'Lender',
  'Community',
  'Lot',
  'Competition',
  null
]);

const AssignmentSchema = new Schema(
  {
    target: {
      type: String,
      enum: ['contact', 'realtor', 'lender'],
      required: true
    },
    refId: { type: Schema.Types.ObjectId, default: null },
    status: {
      type: String,
      enum: TASK_STATUS,
      default: 'Pending'
    }
  },
  { _id: false }
);

const TaskSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    linkedModel: {
      type: String,
      enum: LINKED_MODELS,
      default: null
    },
    linkedId: { type: Schema.Types.ObjectId, default: null },

    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: {
      type: String,
      enum: TASK_TYPES,
      default: 'Custom'
    },
    category: {
      type: String,
      enum: TASK_CATEGORIES,
      default: 'Custom'
    },
    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: 'Medium'
    },
    status: {
      type: String,
      enum: TASK_STATUS,
      default: 'Pending'
    },
    dueDate: { type: Date },
    assignments: {
      type: [AssignmentSchema],
      default: []
    },
    reminderAt: { type: Date },
    completedAt: { type: Date },
    autoCreated: { type: Boolean, default: false },
    reason: { type: String, trim: true }
  },
  { timestamps: true }
);

function sanitizeAssignments(task) {
  if (!Array.isArray(task.assignments) || !task.assignments.length) {
    task.assignments = [
      {
        target: 'contact',
        refId: task.linkedId || null,
        status: task.status || 'Pending'
      }
    ];
  }
  task.assignments = task.assignments.map((assignment) => {
    const normalizedStatus = TASK_STATUS.includes(assignment.status)
      ? assignment.status
      : 'Pending';
    return {
      target: assignment.target,
      refId: assignment.refId || null,
      status: normalizedStatus
    };
  });
  const allCompleted = task.assignments.every((assignment) => assignment.status === 'Completed');
  if (allCompleted) {
    task.status = 'Completed';
  } else if (task.status === 'Completed') {
    task.status = 'In Progress';
  }
}

TaskSchema.pre('save', function preSave(next) {
  sanitizeAssignments(this);
  next();
});

TaskSchema.pre('validate', function preValidate(next) {
  sanitizeAssignments(this);
  next();
});

TaskSchema.index({ company: 1, status: 1, dueDate: 1 });
TaskSchema.index({ company: 1, assignedTo: 1, status: 1 });
TaskSchema.index({ company: 1, priority: 1 });
TaskSchema.index({ linkedModel: 1, linkedId: 1 });

TaskSchema.set('toObject', { virtuals: true });
TaskSchema.set('toJSON', { virtuals: true });

const Task = mongoose.model('Task', TaskSchema);

Task.TYPES = TASK_TYPES;
Task.CATEGORIES = TASK_CATEGORIES;
Task.PRIORITIES = TASK_PRIORITIES;
Task.STATUS = TASK_STATUS;
Task.LINKED_MODELS = LINKED_MODELS;

module.exports = Task;
