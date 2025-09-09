// client/assets/js/my-community-competition/state.js
export let currentCommunityId = null;
export let profileCache = null;
export let linked = [];
export let saveTimer = null;
export let currentChart = null;

export function setCommunityId(id) { currentCommunityId = id; }
export function setProfile(p) { profileCache = p; }
export function setLinked(arr) { linked = arr; }
export function setSaveTimer(t) { saveTimer = t; }
export function setCurrentChart(c) { currentChart = c; }

export function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
