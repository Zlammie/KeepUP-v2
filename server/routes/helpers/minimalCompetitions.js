// helpers/minimalCompetitions.js
const Competition = require('../../models/Competition');

const DEFAULT_FIELDS = 'communityName builderName city state market communityRef isInternal';

const isSuper = (req) => (req.user?.roles || []).includes('SUPER_ADMIN');
const tenantFilter = (req) => (isSuper(req) ? {} : { company: req.user?.company });

/**
 * Fetch a minimal list of competitions for select/search use cases.
 * Applies tenant scoping unless the caller is SUPER_ADMIN.
 */
async function fetchMinimalCompetitions(req, { q = '', limit = 50 } = {}) {
  const trimmed = String(q || '').trim();
  const filter = {
    ...tenantFilter(req),
    ...(trimmed
      ? {
          $or: [
            { communityName: { $regex: trimmed, $options: 'i' } },
            { builderName: { $regex: trimmed, $options: 'i' } },
            { city: { $regex: trimmed, $options: 'i' } },
            { state: { $regex: trimmed, $options: 'i' } }
          ]
        }
      : {})
  };

  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));

  return Competition.find(filter)
    .select(DEFAULT_FIELDS)
    .sort({ builderName: 1, communityName: 1 })
    .limit(safeLimit)
    .lean();
}

module.exports = { fetchMinimalCompetitions };
