import { state } from './state.js';
import { loadLots } from './api.js';
import { updateCount, renderRows, applyClientFilters } from './render.js';




export function bindEvents() {
  const body = document.body;
  const communitySel = document.querySelector('#vl-community');
  const searchInput  = document.querySelector('#vl-search');
  const filterBtns   = [
    document.querySelector('#vl-filter-available'),
    document.querySelector('#vl-filter-spec'),
    document.querySelector('#vl-filter-coming'),
    document.querySelector('#vl-filter-sold')
  ].filter(Boolean);

  // Initial community selection (body[data-community-id] has priority if present)
  const fromBody = body?.getAttribute('data-community-id') || null;
    if (fromBody && window.__communities?.some(c => String(c._id) === String(fromBody))) {
      state.communityId = fromBody;
      window.__communityId = state.communityId;        // <- add
      if (communitySel) communitySel.value = fromBody;
    } else if (window.__communities?.[0]?._id) {
      state.communityId = window.__communities[0]._id;
      window.__communityId = state.communityId;        // <- add
      if (communitySel) communitySel.value = state.communityId;
    }

      communitySel?.addEventListener('change', async () => {
      state.communityId = communitySel.value || null;
      const lots = await loadLots();
      const filtered = applyClientFilters(lots, state.filters);
      renderRows(filtered);
      updateCount(filtered.length);
    });

  // Debounced search
  let t;
  searchInput?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      state.search = searchInput.value.trim();
      const lots = await loadLots();
      const filtered = applyClientFilters(lots, state.filters);
      renderRows(filtered);
      updateCount(filtered.length);
    }, 250);
  });

  // Filter pill visuals (data is not filtered yet; hook up later if you add API params)
    filterBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.filter;
      const active = btn.classList.toggle('active');
      btn.setAttribute('aria-pressed', String(active));
      if (active) state.filters.add(key); else state.filters.delete(key);

      // re-load (in case server-side searching is used), then filter client-side
      const lots = await loadLots();
      const filtered = applyClientFilters(lots, state.filters);
      renderRows(filtered);
      updateCount(filtered.length);
    });
  });
}
