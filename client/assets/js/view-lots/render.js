import { state } from './state.js';
import { esc, displayPlan, displayDate, displayDateTime } from './utils.js';

// keep your getElv/getHomeStatus
function getElv(l) {
  return l.elevation ?? l.elv ?? '';
}

const planNameOf = (l) => {
  // Most robust name sources, in order:
  if (l.floorPlan && typeof l.floorPlan === 'object') return l.floorPlan.name || '';
  if (l.floorPlanName) return l.floorPlanName;
  if (l.planName) return l.planName;
  // If floorPlan is an object with other naming:
  if (l.floorPlan && typeof l.floorPlan === 'object') return l.floorPlan.title || l.floorPlan.label || '';
  return '';
};
function getHomeStatus(l) {
  const raw = l.status ?? l.homeStatus ?? l.inventoryStatus ?? '';
  const s = String(raw).trim().toLowerCase();
  const map = { available: 'Available', spec: 'SPEC', 'coming soon': 'Coming Soon', comingsoon: 'Coming Soon', sold: 'Sold' };
  return map[s] || (raw || '');
}

// tiny utils for compact UI
const badgeForStatus = (s) => {
  const cls = {
    'Available': 'badge-available',
    'SPEC': 'badge-spec',
    'Coming Soon': 'badge-coming',
    'Sold': 'badge-sold'
  }[s] || 'badge-muted';
  return `<span class="status-badge ${cls}">${esc(s)}</span>`;
};
const walkDots = (l) => {
  const done = (v) => Boolean(v && String(v).length);
  const dot = (ok, label) => `<span class="dot ${ok ? 'ok' : ''}" title="${label}${ok ? ' ✓' : ''}"></span>`;
  return `
    <div class="walk-dots" aria-label="Walk milestones">
      ${dot(done(l.thirdParty), '3rd Party')}
      ${dot(done(l.firstWalk), '1st Walk')}
      ${dot(done(l.finalSignOff), 'Final Sign Off')}
    </div>
  `;
};
const buyerTip = (l) => {
  const n = l.purchaser?.lastName ?? '';
  const ph = l.phone ?? '';
  const em = l.email ?? '';
  const parts = [n && `Buyer: ${n}`, ph && `Phone: ${ph}`, em && `Email: ${em}`].filter(Boolean);
  return parts.join(' • ');
};
const closingCell = (l) => {
  const lender = l.lender || (l.primaryLender?.name) || '';
  const when = l.closeDateTime ? displayDateTime(l.closeDateTime) : '';
  return `
    <div class="cell-col">
      <div class="cell-top">${esc(lender)}</div>
      <div class="cell-sub">${esc(when)}</div>
    </div>
  `;
};
const timelineCell = (l) => {
  const rel = displayDate(l.releaseDate);
  const exp = displayDate(l.expectedCompletionDate);
  const cm  = l.closeMonth ?? '';
  const parts = [
    rel && `<span class="tl-item"><span class="tl-label">Rel</span> ${esc(rel)}</span>`,
    exp && `<span class="tl-item"><span class="tl-label">Exp</span> ${esc(exp)}</span>`,
    cm  && `<span class="tl-item"><span class="tl-label">Close</span> ${esc(cm)}</span>`
  ].filter(Boolean).join('<span class="tl-dot">•</span>');
  return `<div class="timeline">${parts || ''}</div>`;
};
const priceCell = (l) => {
  const list = l.listPrice ?? '';
  const sale = l.salesPrice ?? '';
  return `
    <div class="cell-col text-right">
      <div class="cell-sub">${esc(list)}</div>
      <div class="cell-top strong">${esc(sale)}</div>
    </div>
  `;
};

export function renderRows(lots) {
  const tbody = document.querySelector('#lotsTableBody');
  if (!lots?.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted">No lots found</td></tr>';
    return;
  }

  

  tbody.innerHTML = lots.map(l => {
    const lotBlockPhase = [l.lot, l.block, l.phase].filter(Boolean).join(' / ');
    const detailsHref = `/address-details?communityId=${encodeURIComponent(state.communityId)}&lotId=${encodeURIComponent(l._id)}`;
    const status = getHomeStatus(l);
    const planElv = [planNameOf(l), getElv(l)].filter(Boolean).join(' · ');

    // Address now carries a tooltip with purchaser info (replaces the removed columns)
    const addrTitle = buyerTip(l);

    return `
      <tr>
        <td class="sticky-col sc-1">${esc(l.jobNumber ?? '')}</td>
        <td class="sticky-col sc-2">${esc(lotBlockPhase)}</td>
        <td class="sticky-col sc-3 multiline">
        <div class="cell-col">
          <a href="${detailsHref}" class="cell-top link" title="${esc(addrTitle)}">
            ${esc(l.address ?? '')}
          </a>
          <div class="cell-sub">
            ${esc((l.purchaser?.lastName || '').trim())}
          </div>
        </div>
      </td>

        <td>
          <div class="cell-col">
            <div class="cell-top">${esc(planNameOf(l))}</div>
            <div class="cell-sub">${esc(getElv(l))}</div>
          </div>
        </td>
        <td>${badgeForStatus(status)}</td>
        <td>${timelineCell(l)}</td>
        <td>${walkDots(l)}</td>
        <td>${closingCell(l)}</td>
        <td class="text-right">${priceCell(l)}</td>
      </tr>
    `;
  }).join('');
}

export function updateCount(n) {
  const el = document.querySelector('#vl-count');
  if (el) el.textContent = String(n);
}