// Entry point — fetch data, seed UI, and wire listeners
import { state } from './state.js';
import { loadCommunities, loadLots } from './api.js';
import { renderRows, updateCount, applyClientFilters } from './render.js';
import { bindEvents } from './events.js';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // 1) communities
  await loadCommunities();
  // make communities visible to events.js for first-select logic
  window.__communities = state.communities;

  // 2) preselect community + bind events
  bindEvents();

  // 3) initial lots
  const lots = await loadLots();
  const filtered = applyClientFilters(lots, state.filters);
  renderRows(filtered);
  updateCount(filtered.length);
}
