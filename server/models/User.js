const mongoose = require('mongoose');
const { Schema, Types } = mongoose;

const ROLES = Object.freeze({
  SUPER_ADMIN:   'SUPER_ADMIN',
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  MANAGER:       'MANAGER',
  USER:          'USER',
  READONLY:      'READONLY',
});

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  passwordHash: { type: String, required: true },

  // 🔁 roles array (replaces single 'role')
  roles: {
    type: [String],
    enum: Object.values(ROLES),
    default: [ROLES.USER],
    index: true
  },

  // 🏢 tenant
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

  // 🔒 per-user community scope (optional: empty = all in company)
  allowedCommunityIds: [{ type: Schema.Types.ObjectId, ref: 'Community', index: true }],

  // existing flags
  isActive: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: false },
  lastLoginAt: { type: Date }
}, { timestamps: true });

/** ───────────────────── Virtuals for backwards compatibility ───────────────────── */
// Keep old code that reads/writes 'companyId' working during migration.
UserSchema.virtual('companyId')
  .get(function () { return this.company; })
  .set(function (v) { this.company = v; });

/** ───────────────────── Instance helpers ───────────────────── */
UserSchema.methods.hasRole = function hasRole(roleOrRoles) {
  const set = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  return (this.roles || []).some(r => set.includes(r));
};

UserSchema.methods.isSuper = function isSuper() {
  return this.hasRole(ROLES.SUPER_ADMIN);
};

UserSchema.methods.inCommunityScope = function inCommunityScope(communityId) {
  // If user has no restriction, allow all communities in their company
  if (!this.allowedCommunityIds || this.allowedCommunityIds.length === 0) return true;
  if (!communityId) return true; // resource not tied to a community
  const cid = String(communityId);
  return this.allowedCommunityIds.some(id => String(id) === cid);
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

/** ───────────────────── Indexes you’ll want ───────────────────── */
UserSchema.index({ company: 1, 'roles': 1 });
UserSchema.index({ company: 1, allowedCommunityIds: 1 });

UserSchema.set('toObject', { virtuals: true });
UserSchema.set('toJSON',   { virtuals: true });

/** ───────────────────── Export ───────────────────── */
const User = mongoose.model('User', UserSchema);
User.ROLES = ROLES; // handy on import
module.exports = User;
