// assets/js/contact-details/lotSearch.js
import { DOM } from './domCache.js';
import { safe } from './utils.js';
import { debounce } from '../../core/async.js';
import { getState, setLinkedLot } from './state.js';
import { renderFromState } from './lotLink.js';
import { refreshStatusUI } from './status.js';

let selectedLot = null;

export function initLotSearch() {
  const input     = DOM.lotSearchInput  || document.getElementById('lot-search');
  const resultsEl = document.getElementById('lot-search-results');
  const linkBtn   = DOM.linkLotBtn      || document.getElementById('link-lot-btn');

  if (!input || !resultsEl || !linkBtn) return;

  input.addEventListener('input', debounce(() => onType(input, resultsEl), 250));
  resultsEl.addEventListener('click', (e) => onClickResult(e, resultsEl, linkBtn));
  document.addEventListener('click', (e) => {
    // click-away to collapse results
    if (!resultsEl.contains(e.target) && e.target !== input) clearResults(resultsEl);
  });

  linkBtn.addEventListener('click', () => onLinkSelected(resultsEl, linkBtn));
  linkBtn.disabled = true;
}

async function onType(input, resultsEl) {
  const q = input.value.trim();
  clearResults(resultsEl);
  selectedLot = null;

  const commId =
    DOM.communitySelect?.value ||
    getState()?.contact?.communityId ||
    '';

  if (!commId) {
    resultsEl.innerHTML = `<div class="search-hint">Pick a community first.</div>`;
    resultsEl.dataset.state = 'hint';
    return;
  }
  if (!q) return;

  try {
    resultsEl.dataset.state = 'busy';
    const res = await fetch(`/api/communities/${commId}/lots?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const all = await res.json();

    const list = Array.isArray(all) ? all : [];
    // (optional) show unsold first, then sold
    const unsold = list.filter(l => !l.purchaser);
    const sold   = list.filter(l => !!l.purchaser);
    const ordered = [...unsold, ...sold].slice(0, 8); // cap to 8 rows

    renderTable(resultsEl, ordered);
  } catch (err) {
    console.error('[lotSearch] error', err);
    resultsEl.innerHTML = `<div class="search-error">Error fetching lots.</div>`;
    resultsEl.dataset.state = 'error';
  }
}

function renderTable(resultsEl, rows) {
  if (!rows.length) {
    resultsEl.innerHTML = `<div class="search-empty">No results</div>`;
    resultsEl.dataset.state = 'empty';
    return;
  }

  const table = document.createElement('table');
  table.className = 'lot-search-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Address</th>
        <th>Job #</th>
        <th>Lot/Block</th>
        <th>Plan &amp; Elev</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tb = table.querySelector('tbody');

  rows.forEach(lot => {
    const tr = document.createElement('tr');
    tr.className = 'lot-row';
    tr.dataset.lotId = lot._id;
    // simple sold styling hint
    if (lot.purchaser) tr.classList.add('is-sold');

    const planElev = combinePlanElev(lot);

    tr.innerHTML = `
      <td>${safe(lot.address)}</td>
      <td>${safe(lot.jobNumber || '')}</td>
      <td>${safe((lot.lot || '—') + ' / ' + (lot.block || '—'))}</td>
      <td>${safe(planElev || '—')}</td>
      <td>${lot.purchaser ? 'Sold' : 'Available'}</td>
    `;
    tb.appendChild(tr);
  });

  resultsEl.innerHTML = '';
  resultsEl.appendChild(table);
  resultsEl.dataset.state = 'results';
}

function combinePlanElev(lot) {
  const plan =
    lot.planName || lot.plan || lot.floorPlan?.name || lot.floorPlanTitle || '';
  const elev = lot.elevation || lot.elev || '';
  if (plan && elev) return `${plan} – ${elev}`;
  return plan || elev || '';
}

function onClickResult(e, resultsEl, linkBtn) {
  const tr = e.target.closest('tr.lot-row');
  if (!tr) return;

  // ignore already-sold rows (still viewable but not selectable)
  if (tr.classList.contains('is-sold')) return;

  resultsEl.querySelectorAll('tr.lot-row.selected').forEach(r => r.classList.remove('selected'));
  tr.classList.add('selected');

  selectedLot = {
    _id: tr.dataset.lotId,
    address: tr.cells[0]?.textContent?.trim() || '',
    jobNumber: tr.cells[1]?.textContent?.trim() || '',
    lot: (tr.cells[2]?.textContent?.split('/')?.[0] || '').trim(),
    block: (tr.cells[2]?.textContent?.split('/')?.[1] || '').trim(),
  };

  linkBtn.disabled = false;

  // Reveal the small sales details area if you want to capture at link time
  document.getElementById('sales-details')?.classList?.remove('hidden');
}

async function onLinkSelected(resultsEl, linkBtn) {
  if (!selectedLot?._id) return;
  const commId =
    DOM.communitySelect?.value ||
    getState()?.contact?.communityId ||
    '';
  const { contactId } = getState() || {};
  if (!commId || !contactId) return;

  linkBtn.disabled = true;

  try {
    // Link purchaser → lot
    const res = await fetch(`/api/communities/${commId}/lots/${selectedLot._id}/purchaser`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId })
    });
    if (!res.ok) throw new Error(await res.text());
    const linked = await res.json();

    // Update local state so lotLink.js can render the card
    setLinkedLot({
      communityId: commId,
      lotId: linked._id,
      address: linked.address,
      jobNumber: linked.jobNumber,
      lot: linked.lot,
      block: linked.block,
      elevation: linked.elevation,
      planName: linked.planName || linked.plan || linked.floorPlan?.name
    });

    clearResults(resultsEl);
    // Hide the search UI and show the card
    renderFromState();
    refreshStatusUI();
  } catch (err) {
    console.error('Failed to link lot:', err);
    alert('Could not link lot.');
  } finally {
    linkBtn.disabled = false;
  }
}

function clearResults(resultsEl) {
  resultsEl.innerHTML = '';
  resultsEl.dataset.state = '';
  selectedLot = null;
  const linkBtn = DOM.linkLotBtn || document.getElementById('link-lot-btn');
  if (linkBtn) linkBtn.disabled = true;
}
