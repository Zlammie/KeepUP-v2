const DEFAULT_EMBED_FEATURES = {
  enableStatusFilter: true,
  enableFloorPlanFilter: true,
  enableStatusColorMode: true,
  enableFloorPlanColorMode: true
};

const normalizeFlag = (value, fallback) => (
  typeof value === 'boolean' ? value : fallback
);

const resolveEmbedFeatures = (...sources) => {
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
    // Safe fallback: keep status coloring enabled so embeds never render without a color mode.
    features.enableStatusColorMode = true;
  }

  return features;
};

module.exports = {
  DEFAULT_EMBED_FEATURES,
  resolveEmbedFeatures
};
