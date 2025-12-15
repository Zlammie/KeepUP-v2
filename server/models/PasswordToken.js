const mongoose = require('mongoose');

const { Schema } = mongoose;

const TOKEN_TYPES = Object.freeze({
  RESET: 'RESET',
  INVITE: 'INVITE'
});

const PasswordTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(TOKEN_TYPES)
    },
    // Expiration is enforced by Mongo via TTL index
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

PasswordTokenSchema.index({ userId: 1, type: 1, expiresAt: 1 });

const PasswordToken = mongoose.model('PasswordToken', PasswordTokenSchema);
PasswordToken.TOKEN_TYPES = TOKEN_TYPES;

module.exports = PasswordToken;
