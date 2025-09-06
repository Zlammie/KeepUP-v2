(function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const $ = sel => document.querySelector(sel);

  const body = document.body;
  const communitySel = $('#vl-community');
  const searchInput  = $('#vl-search');
  const tbody        = $('#lotsTableBody');
  const countBadge   = $('#vl-count');

  const filterBtns = [
    $('#vl-filter-available'),
    $('#vl-filter-spec'),
    $('#vl-filter-coming'),
    $('#vl-filter-sold')
  ].filter(Boolean);

  let state = {
    communities: [],
    communityId: null,
    search: '',
    filters: new Set(),   // 'available' | 'spec' | 'comingSoon' | 'sold'
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    await loadCommunities();

    const fromBody = body?.getAttribute('data-community-id') || null;
    if (fromBody && state.communities.some(c => String(c._id) === String(fromBody))) {
      state.communityId = fromBody;
      communitySel.value = fromBody;
    } else if (state.communities[0]) {
      state.communityId = state.communities[0]._id;
      communitySel.value = state.communityId;
    }

    await loadLots();

    communitySel?.addEventListener('change', () => {
      state.communityId = communitySel.value || null;
      loadLots();
    });

    // debounce search
    let t;
    searchInput?.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => {
        state.search = searchInput.value.trim();
        loadLots();
      }, 250);
    });

    // pill visuals (we’ll wire the actual filtering later)
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.filter;
        const active = btn.classList.toggle('active');
        btn.setAttribute('aria-pressed', String(active));
        if (active) state.filters.add(key); else state.filters.delete(key);
        // TODO: apply filters via query params or client-side mapping
      });
    });
  }

  async function loadCommunities() {
    try {
      const res = await fetch('/api/communities');
      if (!res.ok) throw new Error(`GET /api/communities → ${res.status}`);
      const items = await res.json();
      state.communities = Array.isArray(items) ? items : [];

      communitySel.innerHTML = state.communities.map(c =>
        `<option value="${esc(c._id)}">${esc(c.name)}${c.projectNumber ? ' — ' + esc(c.projectNumber) : ''}</option>`
      ).join('');
    } catch (err) {
      console.error('Failed to load communities', err);
      communitySel.innerHTML = '<option value="">(failed to load)</option>';
    }
  }

  async function loadLots() {
    if (!state.communityId) {
      tbody.innerHTML = '<tr><td colspan="19" class="text-muted">Select a community</td></tr>';
      updateCount(0);
      return;
    }
    try {
      const url = new URL(`/api/communities/${state.communityId}/lots`, location.origin);
      if (state.search) url.searchParams.set('q', state.search); // server supports ?q= on address

      const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`GET lots → ${res.status}`);
        const data = await res.json();              // ✅ parse once
        const lots = Array.isArray(data) ? data : [];
        renderRows(lots);
        updateCount(lots.length);
    } catch (err) {
      console.error('Failed to load lots', err);
      tbody.innerHTML = `<tr><td colspan="19" class="text-danger">Failed to load lots</td></tr>`;
      updateCount(0);
    }
  }

  function updateCount(n) {
    if (countBadge) countBadge.textContent = `${n}`;
  }

  function renderRows(lots) {
    if (!lots.length) {
      tbody.innerHTML = '<tr><td colspan="19" class="text-muted">No lots found</td></tr>';
      return;
    }

    tbody.innerHTML = lots.map(l => {
  const lotBlockPhase = [l.lot, l.block, l.phase].filter(Boolean).join(' / ');
  const purchaser = l.purchaser?.lastName || '';
  const detailsHref = `/address-details?communityId=${encodeURIComponent(state.communityId)}&lotId=${encodeURIComponent(l._id)}`;

  return `
    <tr>
      <td>${esc(l.jobNumber)}</td>
      <td>${esc(lotBlockPhase)}</td>
      <td><a href="${detailsHref}" class="link">${esc(l.address)}</a></td>
      <td>${esc(displayPlan(l.floorPlan))}</td>
      <td>${esc(l.elevation)}</td>
      <td>${esc(l.status || '')}</td>
      <td>${esc(purchaser)}</td>
      <td>${esc(l.phone || '')}</td>
      <td>${esc(l.email || '')}</td>
      <td>${esc(displayDate(l.releaseDate))}</td>
      <td>${esc(displayDate(l.expectedCompletionDate))}</td>
      <td>${esc(l.closeMonth || '')}</td>
      <td>${esc(l.thirdParty || '')}</td>
      <td>${esc(displayDate(l.firstWalk))}</td>
      <td>${esc(displayDate(l.finalSignOff))}</td>
      <td>${esc(l.lender || '')}</td>
      <td>${esc(displayDateTime(l.closeDateTime))}</td>
      <td>${esc(l.listPrice || '')}</td>
      <td>${esc(l.salesPrice || '')}</td>
    </tr>
  `;
}).join('');
  }

  function displayPlan(fp) {
    if (!fp) return '';
    if (typeof fp === 'object' && (fp.name || fp.planNumber)) {
      return [fp.planNumber, fp.name].filter(Boolean).join(' — ');
    }
    if (typeof fp === 'string') return fp;
    return '';
  }

  function displayDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    return isNaN(dt) ? '' : dt.toLocaleDateString();
  }

  function displayDateTime(d) {
    if (!d) return '';
    const dt = new Date(d);
    return isNaN(dt) ? '' : dt.toLocaleString();
  }
})();
