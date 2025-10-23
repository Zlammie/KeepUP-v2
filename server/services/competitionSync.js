const Competition = require('../models/Competition');
const {
  DEFAULT_SYNC_FIELDS,
  COMMUNITY_FIELD_MAP,
  sanitizeSyncFields,
} = require('../config/competitionSync');

function buildSyncUpdate(community, fields) {
  const list = sanitizeSyncFields(fields);
  const update = {};

  for (const field of list) {
    const path = COMMUNITY_FIELD_MAP[field];
    if (!path) continue;
    const value = community ? community[path] : undefined;
    update[field] = value == null ? null : value;
  }

  return { update, fields: list };
}

async function syncInternalCompetitions(community) {
  if (!community || !community._id) return 0;

  const filter = {
    isInternal: true,
    communityRef: community._id,
  };

  if (community.company) {
    filter.company = community.company;
  }

  const competitions = await Competition.find(filter)
    .select('syncFields')
    .lean();

  if (!competitions.length) return 0;

  let updated = 0;
  for (const comp of competitions) {
    const { update, fields } = buildSyncUpdate(community, comp.syncFields);
    if (!fields.length || !Object.keys(update).length) continue;

    const res = await Competition.updateOne(
      { _id: comp._id },
      {
        $set: update,
        $currentDate: { updatedAt: true },
      }
    );
    updated += res.modifiedCount || 0;
  }

  return updated;
}

module.exports = {
  DEFAULT_SYNC_FIELDS,
  sanitizeSyncFields,
  buildSyncUpdate,
  syncInternalCompetitions,
};
