import { state } from './state.js';
import { esc, displayPlan, displayDate, displayDateTime } from './utils.js';



function getElv(l) {
  // Accept both "elevation" and shorthand "elv"
  return l.elevation ?? l.elv ?? '';
}

function getHomeStatus(l) {
  // Accept status variants and normalize a few common codes
  const raw = l.status ?? l.homeStatus ?? l.inventoryStatus ?? '';
  const s = String(raw).trim().toLowerCase();
  const map = {
    available: 'Available',
    spec: 'SPEC',
    'coming soon': 'Coming Soon',
    comingsoon: 'Coming Soon',
    sold: 'Sold'
  };
  return map[s] || (raw || '');
}

export function updateCount(n) {
  const countBadge = document.querySelector('#vl-count');
  if (countBadge) countBadge.textContent = String(n);
}

export function renderRows(lots) {
  const tbody = document.querySelector('#lotsTableBody');
  if (!lots?.length) {
    tbody.innerHTML = '<tr><td colspan="19" class="text-muted">No lots found</td></tr>';
    return;
  }

  tbody.innerHTML = lots.map(l => {
    const lotBlockPhase = [l.lot, l.block, l.phase].filter(Boolean).join(' / ');
    const detailsHref = `/address-details?communityId=${encodeURIComponent(state.communityId)}&lotId=${encodeURIComponent(l._id)}`;

    return `
      <tr>
        <td>${esc(l.jobNumber ?? '')}</td>
        <td>${esc(lotBlockPhase)}</td>
        <td><a href="${detailsHref}" class="link">${esc(l.address ?? '')}</a></td>

        <!-- NEW: Plan / Elv / Home Status -->
        <td>${esc(displayPlan(l.floorPlan, l))}</td>
        <td>${esc(getElv(l))}</td>
        <td>${esc(getHomeStatus(l))}</td>

        <!-- You can comment out the rest until you’re ready -->
        <td>${esc(l.purchaser?.lastName ?? '')}</td>
        <td>${esc(l.phone ?? '')}</td>
        <td>${esc(l.email ?? '')}</td>
        <td>${esc(displayDate(l.releaseDate))}</td>
        <td>${esc(displayDate(l.expectedCompletionDate))}</td>
        <td>${esc(l.closeMonth ?? '')}</td>
        <td>${esc(l.thirdParty ?? '')}</td>
        <td>${esc(displayDate(l.firstWalk))}</td>
        <td>${esc(displayDate(l.finalSignOff))}</td>
        <td>${esc(l.lender ?? '')}</td>
        <td>${esc(l.closeDateTime ? new Date(l.closeDateTime).toLocaleString() : '')}</td>
        <td>${esc(l.listPrice ?? '')}</td>
        <td>${esc(l.salesPrice ?? '')}</td>
      </tr>
    `;
  }).join('');
}
