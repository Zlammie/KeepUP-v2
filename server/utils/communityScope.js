const { Types } = require('mongoose');

function toStringId(value) {
  if (!value && value !== 0) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Types.ObjectId) return value.toHexString();
  if (typeof value === 'object' && typeof value.toHexString === 'function') {
    return value.toHexString();
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const str = value.toString();
    return str && str !== '[object Object]' ? str : null;
  }
  return String(value);
}

function isSuperAdmin(user) {
  return Array.isArray(user?.roles) && user.roles.includes('SUPER_ADMIN');
}

function getAllowedCommunityIds(user) {
  if (!user) return [];
  const raw = Array.isArray(user.allowedCommunityIds) ? user.allowedCommunityIds : [];
  return raw
    .map(toStringId)
    .filter(Boolean);
}

function hasCommunityAccess(user, communityId) {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const allowed = getAllowedCommunityIds(user);
  if (!allowed.length) return true; // empty list => all communities in company
  const target = toStringId(communityId);
  return target ? allowed.includes(target) : false;
}

function filterCommunitiesForUser(user, communities = []) {
  if (isSuperAdmin(user)) return communities;
  const allowed = getAllowedCommunityIds(user);
  if (!allowed.length) return communities;
  const allowedSet = new Set(allowed);
  return communities.filter((doc) => allowedSet.has(toStringId(doc?._id)));
}

module.exports = {
  toStringId,
  isSuperAdmin,
  getAllowedCommunityIds,
  hasCommunityAccess,
  filterCommunitiesForUser,
};
