const mongoose = require('mongoose');

const { Schema } = mongoose;

const UNSUBSCRIBE_BEHAVIOR = Object.freeze({
  DO_NOT_EMAIL: 'do_not_email',
  SET_NOT_INTERESTED: 'set_not_interested',
  TAG_UNSUBSCRIBED: 'tag_unsubscribed'
});

const EmailSettingsSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true, index: true },
    timezone: { type: String, default: 'America/Chicago' },
    allowedDays: { type: [Number], default: [1, 2, 3, 4, 5] },
    allowedStartTime: { type: String, default: '09:00' },
    allowedEndTime: { type: String, default: '17:00' },
    quietHoursEnabled: { type: Boolean, default: true },
    dailyCap: { type: Number, min: 1, default: 200 },
    perUserCap: { type: Number, min: 1, default: null },
    rateLimitPerMinute: { type: Number, min: 1, default: 30 },
    unsubscribeBehavior: {
      type: String,
      enum: Object.values(UNSUBSCRIBE_BEHAVIOR),
      default: UNSUBSCRIBE_BEHAVIOR.DO_NOT_EMAIL
    }
  },
  { timestamps: true }
);

const EmailSettings = mongoose.model('EmailSettings', EmailSettingsSchema);

EmailSettings.UNSUBSCRIBE_BEHAVIOR = UNSUBSCRIBE_BEHAVIOR;

module.exports = EmailSettings;
