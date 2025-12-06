// assets/js/contact-details/communitySection.js
import { DOM } from './domCache.js';
import { updateTopBarSummary } from './hydrate.js';
import { bindFloorplanAutosave } from './contact-autosave.js';

let communitiesAbort;
let floorplansAbort;
let lastSeedToken = 0;

export function initCommunitySection() {
  if (DOM.communitySelect) {
    // keep select as the data source; actual UI is the chip list
    DOM.communitySelect.multiple = true;
    DOM.communitySelect.size = DOM.communitySelect.size || 6;
    DOM.communitySelect.addEventListener('change', handleCommunityChange);
  }
}

// Run after contact is fetched to populate communities list
export async function populateCommunities({ contact }) {
  if (!DOM.communitySelect) return;

  communitiesAbort?.abort();
  communitiesAbort = new AbortController();

  setLoading(DOM.communitySelect, true);
  setChipLoading(true);
  try {
    const res = await fetch('/api/communities', { signal: communitiesAbort.signal });
    if (!res.ok) throw new Error(`GET /api/communities - ${res.status}`);
    const comms = await res.json(); // [{_id, name}]

    buildCommunityOptions(comms);

    // Preselect saved communities
    const preselectedIds = normalizeIdArray(contact?.communities || contact?.communityIds || []);
    applySelection(preselectedIds, { silent: true });
    renderCommunityChips(comms, new Set(preselectedIds.map(String)));

    // Seed floorplans for the last selected (if any)
    const targetId = lastSelectedId(DOM.communitySelect);
    if (targetId) {
      await seedFloorplans(targetId, normalizeIdArray(contact?.floorplans || []));
    } else {
      clearFloorplans();
    }

    // Keep a hidden input in sync for your save handler (if present)
    syncHiddenCommunities();
    DOM.communitySelect.addEventListener('change', syncHiddenCommunities);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Failed to load communities:', err);
      clearFloorplans();
    }
  } finally {
    setLoading(DOM.communitySelect, false);
    setChipLoading(false);
  }
}

export async function handleCommunityChange(e) {
  const ids = getSelectedIds(e.target);
  clearFloorplans();
  if (!ids.length) return;
  // Seed using the most recently selected (last in document order)
  await seedFloorplans(ids[ids.length - 1], []);
}

function syncHiddenCommunities() {
  const hidden = document.getElementById('communities'); // optional hidden input
  if (!hidden) return;
  hidden.value = JSON.stringify(getSelectedIds(DOM.communitySelect));
}

async function seedFloorplans(commId, preCheckedIds = []) {
  if (!DOM.floorplansContainer) return;

  floorplansAbort?.abort();
  floorplansAbort = new AbortController();
  const token = ++lastSeedToken;

  setFloorplansLoading(true);
  try {
    const res = await fetch(`/api/communities/${commId}/floorplans`, { signal: floorplansAbort.signal });
    if (!res.ok) throw new Error(`GET /api/communities/${commId}/floorplans - ${res.status}`);
    const plans = await res.json();

    if (token !== lastSeedToken) return;

    const checked = new Set(normalizeIdArray(preCheckedIds));
    const frag = document.createDocumentFragment();

    for (const plan of plans) {
      const lbl = document.createElement('label');
      lbl.style.display = 'block';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = 'floorplans';
      cb.value = String(plan._id);
      if (checked.has(String(plan._id))) cb.checked = true;

      lbl.appendChild(cb);
      lbl.insertAdjacentText('beforeend', ` ${plan.name ?? 'Plan'}${plan.planNumber ? ` (${plan.planNumber})` : ''}`);
      frag.appendChild(lbl);
    }

    DOM.floorplansContainer.innerHTML = '';
    DOM.floorplansContainer.appendChild(frag);

    bindFloorplanAutosave();

    DOM.floorplansContainer
      .querySelectorAll('input[type="checkbox"]')
      .forEach((cb) => cb.addEventListener('change', updateTopBarSummary));

    updateTopBarSummary();
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Failed to seed floorplans:', err);
      DOM.floorplansContainer.innerHTML = '<em class="text-muted">Could not load floorplans.</em>';
    }
  } finally {
    setFloorplansLoading(false);
  }
}

// --- helpers ----
function clearFloorplans() {
  if (!DOM.floorplansContainer) return;
  DOM.floorplansContainer.innerHTML = '';
}

function normalizeIdArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => {
      if (!x) return '';
      if (typeof x === 'string') return x;
      if (typeof x === 'object' && x._id) return String(x._id);
      return String(x);
    })
    .filter(Boolean);
}

function getSelectedIds(selectEl) {
  return Array.from(selectEl.selectedOptions).map((o) => o.value);
}

function lastSelectedId(selectEl) {
  const ids = getSelectedIds(selectEl);
  return ids.length ? ids[ids.length - 1] : '';
}

function setLoading(selectEl, isLoading) {
  if (!selectEl) return;
  selectEl.disabled = !!isLoading;
  selectEl.classList.toggle('is-loading', !!isLoading);
}

function setFloorplansLoading(isLoading) {
  if (!DOM.floorplansContainer) return;
  DOM.floorplansContainer.classList.toggle('is-loading', !!isLoading);
}

function setChipLoading(isLoading) {
  if (!DOM.communityChipList) return;
  DOM.communityChipList.classList.toggle('is-loading', !!isLoading);
}

function buildCommunityOptions(list) {
  DOM.communitySelect.innerHTML = '';
  const frag = document.createDocumentFragment();
  for (const c of list) {
    const opt = document.createElement('option');
    opt.value = String(c._id);
    opt.textContent = c.name;
    frag.appendChild(opt);
  }
  DOM.communitySelect.appendChild(frag);
}

function renderCommunityChips(list, selectedSet = new Set()) {
  if (!DOM.communityChipList) return;
  DOM.communityChipList.innerHTML = '';
  if (!Array.isArray(list) || !list.length) {
    DOM.communityChipList.innerHTML = '<div class="text-muted small">No communities available.</div>';
    return;
  }

  list.forEach((c) => {
    const id = String(c._id);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'community-chip';
    chip.dataset.communityId = id;
    chip.setAttribute('role', 'option');
    chip.textContent = c.name || 'Community';
    chip.classList.toggle('is-selected', selectedSet.has(id));
    chip.setAttribute('aria-selected', selectedSet.has(id) ? 'true' : 'false');

    chip.addEventListener('click', () => {
      const current = new Set(getSelectedIds(DOM.communitySelect));
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }
      applySelection(Array.from(current));
      chip.classList.toggle('is-selected', current.has(id));
      chip.setAttribute('aria-selected', current.has(id) ? 'true' : 'false');
    });

    DOM.communityChipList.appendChild(chip);
  });
}

function applySelection(idList, { silent = false } = {}) {
  const set = new Set(normalizeIdArray(idList).map(String));
  Array.from(DOM.communitySelect.options).forEach((opt) => {
    opt.selected = set.has(opt.value);
  });
  syncHiddenCommunities();
  updateTopBarSummary();
  if (!silent) {
    // trigger downstream listeners (floorplans + lender highlight)
    DOM.communitySelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
