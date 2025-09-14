// /assets/js/view-lots/render.js

// ---------- small helpers ----------
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = String(text);
  return n;
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString(undefined, { year: '2-digit', month: '2-digit', day: '2-digit' });
}
function fmtDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });
}
function fmtCurrency(n) {
  if (n == null || isNaN(Number(n))) return '';
  return Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function iconCell(src, alt) {
   const td = el('td', 'icon-cell text-center');
  const btn = el('button', 'icon-btn btn btn-sm btn-link');
  btn.type = 'button';
  const img = el('img');
  img.src = src;
  img.alt = alt;
  img.width = 16;
  img.height = 16;
  btn.appendChild(img);
  td.appendChild(btn);
  return td;
}

function twoLineCell(top, sub, strong = false) {
  const td = el('td');
  const col = el('div', `cell-col${strong ? ' strong' : ''}`);
  col.appendChild(el('div', 'cell-top', top || ''));
  if (sub) col.appendChild(el('div', 'cell-sub', sub));
  td.appendChild(col);
  return td;
}

function statusBadge(statusRaw) {
  const status = String(statusRaw || '').toLowerCase();
  const span = el('span', 'status-badge ' + (
    status.includes('available') ? 'badge-available'
      : status.includes('spec') ? 'badge-spec'
      : status.includes('coming') ? 'badge-coming'
      : status.includes('sold') ? 'badge-sold'
      : 'badge-muted'
  ));
  span.textContent = status
    ? status.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : '—';
  return span;
}

function getPlanName(lot) {
  // Prefer explicit fields
  if (lot.planName) return lot.planName;

  // If 'plan' is an object, try common name fields
  if (lot.plan && typeof lot.plan === 'object') {
    return lot.plan.name || lot.plan.title || lot.plan.code || lot.plan.planName || '';
  }

  // Other common shapes used in some pages/APIs
  if (lot.floorPlanName) return lot.floorPlanName;
  if (lot.floorPlan && typeof lot.floorPlan === 'object') {
    return lot.floorPlan.name || lot.floorPlan.title || lot.floorPlan.code || '';
  }

  // If it's a plain string (but not a readable name), you’ll likely need server-side population
  return typeof lot.plan === 'string' ? '' : '';
}

function getElevationName(lot) {
  if (lot.elevationName) return lot.elevationName;
  if (lot.elevation && typeof lot.elevation === 'object') {
    return lot.elevation.name || lot.elevation.code || lot.elevation.title || '';
  }
  return typeof lot.elevation === 'string' ? lot.elevation : '';
}

function walksDots(firstDone, finalDone) {
  const td = el('td');
  const wrap = el('div', 'walk-dots');
  const dot1 = el('span', 'dot' + (firstDone ? ' ok' : ''));
  dot1.title = '1st Walk';
  const dot2 = el('span', 'dot' + (finalDone ? ' ok' : ''));
  dot2.title = 'Final Sign Off';
  wrap.appendChild(dot1);
  wrap.appendChild(dot2);
  td.appendChild(wrap);
  return td;
}

function timelineCell({ releaseDate, expectedCompletionDate, firstWalkDate, finalSignOffDate } = {}) {
  const td = el('td');
  const tl = el('div', 'timeline');

  const add = (label, value) => {
    const item = el('div', 'tl-item');
    item.appendChild(el('span', 'tl-label', label));
    item.appendChild(el('span', null, value || '—'));
    tl.appendChild(item);
    tl.appendChild(el('span', 'tl-dot', '•'));
  };

  add('Release', fmtDate(releaseDate));
  add('Expected', fmtDate(expectedCompletionDate));
  add('1st', fmtDate(firstWalkDate));
  // remove trailing dot
  tl.removeChild(tl.lastChild);
  // final item (no trailing dot)
  const last = el('div', 'tl-item');
  last.appendChild(el('span', 'tl-label', 'Final'));
  last.appendChild(el('span', null, fmtDate(finalSignOffDate) || '—'));
  tl.appendChild(last);

  td.appendChild(tl);
  return td;
}

function addressCell(lot) {
  // sticky col #3
  const td = el('td', 'sticky-col sc-3');
  const col = el('div', 'cell-col');

  const communityId =
    lot.communityId ||
    (lot.community && (lot.community._id || lot.community.id)) ||
    window.__communityId || '';   // <- fallback to selected community

  const lotId = lot._id || '';

  const a = el('a', 'link');
  a.href = `/address-details?communityId=${encodeURIComponent(communityId)}&lotId=${encodeURIComponent(lotId)}`;
  a.textContent = lot.addressLine1 || lot.address || 'Address';

  const subLines = [];

  // city/state/zip line
  {
    const sub = [];
    if (lot.city) sub.push(lot.city);
    if (lot.state) sub.push(lot.state);
    if (lot.zip) sub.push(lot.zip);
    if (sub.length) subLines.push(sub.join(', '));
  }

  // purchaser line (if available)
  {
    const buyer =
      lot.purchaserName ||
      (lot.purchaser && (lot.purchaser.name || [lot.purchaser.firstName, lot.purchaser.lastName].filter(Boolean).join(' '))) ||
      lot.buyerName ||
      '';
    if (buyer) subLines.push(`Purchaser: ${buyer}`);
  }

  const top = el('div', 'cell-top');
  top.appendChild(a);
  col.appendChild(top);

  subLines.forEach(line => col.appendChild(el('div', 'cell-sub', line)));

  td.appendChild(col);
  return td;
}

// ---------- exports expected by index.js / events.js ----------
export function updateCount(n) {
  const elCount = document.querySelector('#vl-count');
  if (elCount) elCount.textContent = String(n ?? 0);
}

export function renderRows(lots = []) {
  const tbody = document.querySelector('#lotsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  lots.forEach((lot) => {
    const row = el('tr');
    row.dataset.id = lot._id || '';

    // Icons FIRST: Task, Flag, Comment
    row.appendChild(iconCell('/assets/icons/add_task.svg', 'Task'));
    row.appendChild(iconCell('/assets/icons/exclamation.svg', 'Flag'));
    row.appendChild(iconCell('/assets/icons/comment.svg', 'Comment'));

    // Job # (sticky #1)
    {
      const td = twoLineCell(lot.jobNumber || '—', '', true);
      td.classList.add('sticky-col', 'sc-1');
      row.appendChild(td);
    }

    // Lot / Block / Phase (sticky #2)
    {
      const top = [lot.lot, lot.block].filter(Boolean).join(' • ') || '—';
      const sub = lot.phase ? `Phase ${lot.phase}` : '';
      const td = twoLineCell(top, sub);
      td.classList.add('sticky-col', 'sc-2');
      row.appendChild(td);
    }

    // Address (sticky #3)
    row.appendChild(addressCell(lot));

    // --- Plan / Elv ---
    {
      const plan = getPlanName(lot);
      const elv  = getElevationName(lot);
      const top  = [plan, elv].filter(Boolean).join(' • ') || '—';
      row.appendChild(twoLineCell(top, ''));
    }


    // Home Status
    {
      const td = el('td');
      td.appendChild(statusBadge(lot.homeStatus || lot.status));
      row.appendChild(td);
    }

    // Timeline
    row.appendChild(
      timelineCell({
        releaseDate: lot.releaseDate,
        expectedCompletionDate: lot.expectedCompletionDate,
        firstWalkDate: lot.firstWalkDate,
        finalSignOffDate: lot.finalSignOffDate
      })
    );

    // Walks
    row.appendChild(
      walksDots(Boolean(lot.firstWalkDone), Boolean(lot.finalSignOffDone))
    );

    // Closing
    {
      const top = fmtDate(lot.closeDate) || '—';
      const sub = lot.closeTime ? `@ ${lot.closeTime}` : (lot.closeDate ? fmtDateTime(lot.closeDate) : '');
      row.appendChild(twoLineCell(top, sub || ''));
    }

      // --- Price (right-aligned) ---
    {
      const td = el('td', 'text-right strong');
      const price =
        lot.salesPrice ??
        lot.listPrice ??
        lot.list_price ??
        lot.basePrice ??
        lot.price ??
        null;
      td.textContent = price != null ? fmtCurrency(price) : '';
      row.appendChild(td);
    }

    tbody.appendChild(row);
  });
}
