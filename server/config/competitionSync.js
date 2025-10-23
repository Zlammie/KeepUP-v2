const DEFAULT_SYNC_FIELDS = Object.freeze([
  'communityName',
  'builderName',
  'address',
  'market',
  'city',
  'state'
]);

const COMMUNITY_FIELD_MAP = Object.freeze({
  communityName: 'name',
  builderName: 'name',
  address: 'name',
  market: 'market',
  city: 'city',
  state: 'state'
});

const SYNCABLE_FIELDS = Object.freeze(Object.keys(COMMUNITY_FIELD_MAP));

function sanitizeSyncFields(input, { fallbackToDefault = true } = {}) {
  const fields = Array.isArray(input) ? input : [];
  const seen = new Set();

  for (const raw of fields) {
    if (raw == null) continue;
    const key = String(raw).trim();
    if (!key) continue;
    if (!COMMUNITY_FIELD_MAP[key]) continue;
    if (!seen.has(key)) seen.add(key);
  }

  if (!seen.size && fallbackToDefault) {
    DEFAULT_SYNC_FIELDS.forEach((field) => seen.add(field));
  }

  return Array.from(seen);
}

module.exports = {
  DEFAULT_SYNC_FIELDS,
  COMMUNITY_FIELD_MAP,
  SYNCABLE_FIELDS,
  sanitizeSyncFields,
};
