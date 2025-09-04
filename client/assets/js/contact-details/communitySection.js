// assets/js/contact-details/communitySection.js
import { DOM } from './domCache.js';
import { updateTopBarSummary } from './hydrate.js';

let communitiesAbort;   // prevents stale community lists
let floorplansAbort;    // prevents stale floorplan seeds
let lastSeedToken = 0;  // tie async results to the latest request

export function initCommunitySection() {
  if (DOM.communitySelect) {
    DOM.communitySelect.addEventListener('change', handleCommunityChange);
  }
}

// Run after contact is fetched to populate communities list
export async function populateCommunities({ contact }) {
  if (!DOM.communitySelect) return;

  // abort any in-flight fetch
  communitiesAbort?.abort();
  communitiesAbort = new AbortController();

  setLoading(DOM.communitySelect, true);
  try {
    const res = await fetch('/api/communities', { signal: communitiesAbort.signal });
    if (!res.ok) throw new Error(`GET /api/communities → ${res.status}`);
    const comms = await res.json();

    // Rebuild options
    DOM.communitySelect.innerHTML = '<option value="">-- Select Community --</option>';
    const frag = document.createDocumentFragment();
    for (const c of comms) {
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = c.name;
      frag.appendChild(opt);
    }
    DOM.communitySelect.appendChild(frag);

    // Preselect saved community
    const savedComm = contact?.communityId?._id || contact?.communityId || '';
    if (savedComm) {
      DOM.communitySelect.value = savedComm;
      // Seed floorplans for the pre-selected community
      await seedFloorplans(savedComm, normalizeIdArray(contact?.floorplans || []));
    } else {
      clearFloorplans();
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Failed to load communities:', err);
      clearFloorplans();
    }
  } finally {
    setLoading(DOM.communitySelect, false);
  }
}

export async function handleCommunityChange(e) {
  const commId = e.target.value;
  clearFloorplans();
  if (!commId) return;
  await seedFloorplans(commId, []); // no pre-checked plans on manual change
}

async function seedFloorplans(commId, preCheckedIds = []) {
  if (!DOM.floorplansContainer) return;

  // Abort any previous seed
  floorplansAbort?.abort();
  floorplansAbort = new AbortController();
  const token = ++lastSeedToken;

  setFloorplansLoading(true);
  try {
    const res = await fetch(`/api/communities/${commId}/floorplans`, { signal: floorplansAbort.signal });
    if (!res.ok) throw new Error(`GET /api/communities/${commId}/floorplans → ${res.status}`);
    const plans = await res.json();

    // If a newer request started while we awaited, drop this result
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

    // Update summary on change
    DOM.floorplansContainer
      .querySelectorAll('input[type="checkbox"]')
      .forEach(cb => cb.addEventListener('change', updateTopBarSummary));

    // First summary sync
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
  // Handles strings, ObjectIds, and objects like {_id: '...'}
  return arr.map(x => {
    if (!x) return '';
    if (typeof x === 'string') return x;
    if (typeof x === 'object' && x._id) return String(x._id);
    return String(x);
  });
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
