export const DEFAULT_EMBED_FEATURES = {
  enableStatusFilter: true,
  enableFloorPlanFilter: true,
  enableStatusColorMode: true,
  enableFloorPlanColorMode: true
};

const normalizeFlag = (value, fallback) => (
  typeof value === 'boolean' ? value : fallback
);

export const resolveEmbedFeatures = (...sources) => {
  let features = { ...DEFAULT_EMBED_FEATURES };
  sources.forEach((source) => {
    if (!source || typeof source !== 'object') return;
    features = {
      enableStatusFilter: normalizeFlag(source.enableStatusFilter, features.enableStatusFilter),
      enableFloorPlanFilter: normalizeFlag(source.enableFloorPlanFilter, features.enableFloorPlanFilter),
      enableStatusColorMode: normalizeFlag(source.enableStatusColorMode, features.enableStatusColorMode),
      enableFloorPlanColorMode: normalizeFlag(source.enableFloorPlanColorMode, features.enableFloorPlanColorMode)
    };
  });

  if (!features.enableStatusColorMode && !features.enableFloorPlanColorMode) {
    // Safe fallback: keep status coloring available so embeds never render without a color mode.
    features.enableStatusColorMode = true;
  }

  return features;
};

export const resolveStyleMode = (storedMode, features) => {
  const normalized = storedMode === 'floorPlan'
    ? 'plan'
    : (storedMode === 'plan' || storedMode === 'status' ? storedMode : '');
  const allowed = new Set();
  if (features?.enableStatusColorMode) allowed.add('status');
  if (features?.enableFloorPlanColorMode) allowed.add('plan');
  const fallback = allowed.has('status') ? 'status' : (allowed.values().next().value || 'status');
  const next = normalized && allowed.has(normalized) ? normalized : fallback;
  return { next, normalized, fallback, allowed };
};
