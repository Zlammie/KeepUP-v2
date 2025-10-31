const mongoose = require('mongoose');
const { Schema } = mongoose;

const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  MANAGER: 'MANAGER',
  USER: 'USER',
  READONLY: 'READONLY'
});

const STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  INVITED: 'INVITED'
});

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String, required: true },

    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, trim: true },

    roles: {
      type: [String],
      enum: Object.values(ROLES),
      default: [ROLES.USER],
      index: true
    },

    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.INVITED,
      index: true
    },

    manager: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

    allowedCommunityIds: [{ type: Schema.Types.ObjectId, ref: 'Community', index: true }],

    notes: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: { type: Date }
  },
  { timestamps: true }
);

UserSchema.virtual('companyId')
  .get(function getCompanyId() {
    return this.company;
  })
  .set(function setCompanyId(value) {
    this.company = value;
  });

UserSchema.methods.hasRole = function hasRole(roleOrRoles) {
  const set = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  return (this.roles || []).some((role) => set.includes(role));
};

UserSchema.methods.isSuper = function isSuper() {
  return this.hasRole(ROLES.SUPER_ADMIN);
};

UserSchema.methods.inCommunityScope = function inCommunityScope(communityId) {
  if (!this.allowedCommunityIds || this.allowedCommunityIds.length === 0) return true;
  if (!communityId) return true;
  const cid = String(communityId);
  return this.allowedCommunityIds.some((id) => String(id) === cid);
};

UserSchema.methods.canRead = function canRead() {
  return this.isSuper() || this.hasRole([ROLES.COMPANY_ADMIN, ROLES.MANAGER, ROLES.USER, ROLES.READONLY]);
};

UserSchema.methods.canWrite = function canWrite() {
  return this.isSuper() || this.hasRole([ROLES.COMPANY_ADMIN, ROLES.MANAGER, ROLES.USER]);
};

UserSchema.methods.canDelete = function canDelete() {
  return this.isSuper() || this.hasRole([ROLES.COMPANY_ADMIN, ROLES.MANAGER]);
};

UserSchema.index({ company: 1, roles: 1 });
UserSchema.index({ company: 1, allowedCommunityIds: 1 });
UserSchema.index({ company: 1, status: 1 });

UserSchema.set('toObject', { virtuals: true });
UserSchema.set('toJSON', { virtuals: true });

const User = mongoose.model('User', UserSchema);
User.ROLES = ROLES;
User.STATUS = STATUS;

module.exports = User;
