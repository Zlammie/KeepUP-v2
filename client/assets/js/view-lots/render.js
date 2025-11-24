// /assets/js/view-lots/render.js

// ---------- tiny DOM & format helpers ----------
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
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}
function fmtTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtCurrency(n) {
  if (n == null || isNaN(Number(n))) return '';
  return Number(n).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

// ---------- data extractors ----------
function getPlanName(lot) {
  if (lot.planName) return lot.planName;
  if (lot.plan && typeof lot.plan === 'object') {
    return lot.plan.name || lot.plan.title || lot.plan.code || lot.plan.planName || '';
  }
  if (lot.floorPlanName) return lot.floorPlanName;
  if (lot.floorPlan && typeof lot.floorPlan === 'object') {
    return lot.floorPlan.name || lot.floorPlan.title || lot.floorPlan.code || '';
  }
  // if plan is an ObjectId string, we can't infer a name client-side
  return typeof lot.plan === 'string' ? '' : (lot.plan || '');
}
function getElevationName(lot) {
  if (lot.elevationName) return lot.elevationName;
  if (lot.elevation && typeof lot.elevation === 'object') {
    return lot.elevation.name || lot.elevation.code || lot.elevation.title || '';
  }
  return typeof lot.elevation === 'string' ? lot.elevation : '';
}

function trimToString(value) {
  return value == null ? '' : String(value).trim();
}

function buildContactName(contact) {
  if (!contact || typeof contact !== 'object') return '';
  if (contact._bsontype) return '';
  const first = trimToString(contact.firstName);
  const last = trimToString(contact.lastName);
  const parts = [];
  if (first) parts.push(first);
  if (last) parts.push(last);
  if (parts.length) return parts.join(' ');
  const full = trimToString(contact.fullName);
  if (full) return full;
  return trimToString(contact.name);
}

function getPurchaserMeta(lot) {
  const data = lot || {};
  const raw = data.purchaser;

  const fallbackName = [
    trimToString(data.purchaserDisplayName),
    trimToString(data.purchaserName),
    trimToString(data.buyerName)
  ].find(Boolean) || '';

  let name = buildContactName(raw) || fallbackName;

  let id = data.purchaserId || null;
  if (!id && raw && typeof raw === 'object' && raw !== null) {
    id = raw._id || raw.id || null;
  } else if (!id && typeof raw === 'string') {
    id = raw;
  }
  id = id ? String(id).trim() : null;

  if (!trimToString(name) && id) {
    name = id;
  }

  return {
    name: trimToString(name),
    id: id,
    href: id ? '/contact-details?id=' + encodeURIComponent(id) : null
  };
}

// ---------- cell helpers ----------
function actionsCell(lot) {
  const td = el('td', 'contact-table-icons');
  const wrap = el('div', 'table-action-buttons');
  const labelTarget =
    trimToString(lot.addressLine1 || lot.address || lot.jobNumber || lot.lot || 'this lot') ||
    'this lot';
  const lotId =
    lot._id ||
    lot.id ||
    (typeof lot.lot === 'object' ? lot.lot._id || lot.lot.id : '') ||
    '';
  const communityId =
    lot.communityId ||
    (lot.community && (lot.community._id || lot.community.id)) ||
    window.__communityId ||
    '';
  const jobNumber = trimToString(lot.jobNumber);

  const makeBtn = (src, label, action) => {
    const btn = el('button', 'table-icon-btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', label);
    if (action) btn.dataset.action = action;
    if (lotId) btn.dataset.lotId = lotId;
    if (communityId) btn.dataset.communityId = communityId;
    if (labelTarget) btn.dataset.address = labelTarget;
    if (jobNumber) btn.dataset.jobNumber = jobNumber;
    const img = el('img');
    img.src = src;
    img.alt = '';
    btn.appendChild(img);
    return btn;
  };

  wrap.appendChild(makeBtn('/assets/icons/add_task.svg', `Add or view tasks for ${labelTarget}`, 'task'));
  wrap.appendChild(makeBtn('/assets/icons/exclamation.svg', `Flag ${labelTarget}`, 'flag'));
  wrap.appendChild(makeBtn('/assets/icons/comment.svg', `Add a comment for ${labelTarget}`, 'comment'));

  td.appendChild(wrap);
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
  const raw = String(statusRaw || '').trim();
  const status = raw.toLowerCase();

  let cls = 'badge-muted';
  let label = raw || '—';

  if (status.includes('available')) {
    cls = 'badge-available'; label = 'Available';
  } else if (status.includes('spec')) {
    cls = 'badge-spec'; label = 'SPEC';
  } else if (status.includes('coming')) {
    cls = 'badge-coming'; label = 'Coming Soon';
  } else if (status.includes('sold')) {
    cls = 'badge-sold'; label = 'Sold';
  } else if (status.includes('model')) {
    cls = 'badge-model'; label = 'Model';
  } else if (status.includes('closed')) {
    cls = 'badge-closed'; label = 'Closed';
  } else if (status.includes('hold')) {
    cls = 'badge-hold'; label = 'Hold';
  }

  const span = el('span', `status-badge ${cls}`);
  span.textContent = label || '—';
  return span;
}

function statusSplitCell(lot) {
  const td = el('td', 'status-split-cell');
  const wrap = el('div', 'status-split');

  const gen = lot.generalStatus || lot.general || lot.statusGeneral || lot.status || '';
  const build = lot.buildingStatus || lot.constructionStatus || lot.homeStatus || lot.status || '';

  const top = el('div', 'status-split-row');
  top.appendChild(el('div', 'status-split-label', 'General'));
  top.appendChild(statusBadge(gen));
  wrap.appendChild(top);

  wrap.appendChild(el('div', 'status-split-divider'));

  const bot = el('div', 'status-split-row');
  bot.appendChild(el('div', 'status-split-label', 'Building'));
  bot.appendChild(statusBadge(build));
  wrap.appendChild(bot);

  td.appendChild(wrap);
  return td;
}
function walksDots(firstDone, finalDone) {
  const td = el('td');
  const wrap = el('div', 'walk-dots');
  const dot1 = el('span', 'dot' + (firstDone ? ' ok' : '')); dot1.title = '1st Walk';
  const dot2 = el('span', 'dot' + (finalDone ? ' ok' : '')); dot2.title = 'Final Sign Off';
  wrap.appendChild(dot1); wrap.appendChild(dot2);
  td.appendChild(wrap);
  return td;
}
function timelineCell({ releaseDate, expectedCompletionDate } = {}) {
  const td = el('td', 'timeline2-cell');

  const wrap = el('div', 'timeline2-wrap');

  // Top: Release Date
  const topSec = el('div', 'timeline2-sec');
  topSec.appendChild(el('div', 'timeline2-label', 'Release Date'));
  topSec.appendChild(el('div', 'timeline2-value', fmtDate(releaseDate) || '—'));
  wrap.appendChild(topSec);

  // Divider
  wrap.appendChild(el('div', 'timeline2-divider'));

  // Bottom: Expected Completion (month)
  const botSec = el('div', 'timeline2-sec');
  botSec.appendChild(el('div', 'timeline2-label', 'Expected Completion'));
  botSec.appendChild(el('div', 'timeline2-value', fmtMonth(expectedCompletionDate) || '—'));
  wrap.appendChild(botSec);

  td.appendChild(wrap);
  return td;
}

    function fmtMonth(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return '';
  return dt.toLocaleString(undefined, { month: 'short', year: 'numeric' }); // e.g., "Sep 2025"
}
function addressCell(lot) {
  // sticky col #3
  const td = el('td', 'sticky-col sc-3');
  const col = el('div', 'cell-col');

  const communityId =
    lot.communityId ||
    (lot.community && (lot.community._id || lot.community.id)) ||
    window.__communityId || '';
  const lotId = lot._id || '';

  const addressLink = el('a', 'link');
  addressLink.href = `/address-details?communityId=${encodeURIComponent(communityId)}&lotId=${encodeURIComponent(lotId)}`;
  addressLink.textContent = lot.addressLine1 || lot.address || 'Address';

  const top = el('div', 'cell-top');
  top.appendChild(addressLink);
  col.appendChild(top);

  const locationBits = [];
  if (lot.city) locationBits.push(lot.city);
  if (lot.state) locationBits.push(lot.state);
  if (lot.zip) locationBits.push(lot.zip);
  if (locationBits.length) {
    col.appendChild(el('div', 'cell-sub', locationBits.join(', ')));
  }

  const purchaserMeta = getPurchaserMeta(lot);
  if (purchaserMeta.name) {
    const sub = el('div', 'cell-sub purchaser-sub');
    const text = `Purchaser: ${purchaserMeta.name}`;
    if (purchaserMeta.href) {
      const link = el('a', 'link cell-sub-link');
      link.href = purchaserMeta.href;
      link.textContent = text;
      sub.appendChild(link);
    } else {
      sub.textContent = text;
    }
    col.appendChild(sub);
  }

  td.appendChild(col);
  return td;
}
function priceCell(lot) {
  const td = el('td', 'price-cell text-right');

  const list =
    lot.listPrice ??
    lot.list_price ??
    lot.basePrice ??
    lot.price ??
    null;

  const sales =
    lot.salesPrice ??
    lot.sales_price ??
    lot.salePrice ??
    null;

  const wrap = el('div', 'price-wrap');

  // Top: List Price
  const topSec = el('div', 'price-sec');
  topSec.appendChild(el('div', 'price-label', 'List Price'));
  topSec.appendChild(el('div', 'price-value', list != null ? fmtCurrency(list) : '—'));
  wrap.appendChild(topSec);

  // Divider
  wrap.appendChild(el('div', 'price-divider'));

  // Bottom: Sales Price
  const botSec = el('div', 'price-sec');
  botSec.appendChild(el('div', 'price-label', 'Sales Price'));
  botSec.appendChild(el('div', 'price-value', sales != null ? fmtCurrency(sales) : '—'));
  wrap.appendChild(botSec);

  td.appendChild(wrap);
  return td;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function walkStatusFromDate(d) {
  if (!d) return 'none';                    // not scheduled -> red
  const dt = new Date(d);
  if (isNaN(dt)) return 'none';
  const today = new Date();
  // strip time on both for “same day”
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d0 = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  if (d0.getTime() === t0.getTime()) return 'today'; // yellow
  if (d0.getTime() > t0.getTime()) return 'future';  // blue
  return 'past';                                     // green
}

function walkDot(status, label, dateVal) {
  const span = document.createElement('span');
  span.className = `dot dot-${status}`; // dot-none/red, dot-future/blue, dot-today/yellow, dot-past/green
  const when = dateVal ? fmtDate(dateVal) : 'Not scheduled';
  span.title = `${label}: ${when}`;
  return span;
}

// 3-dot cell: Third Party, 1st Walk, Final Sign Off
function walksCell(lot) {
  const td = document.createElement('td');
  td.classList.add('walk-cell');
  const wrap = document.createElement('div');
  wrap.className = 'walk-dots';

  // Only “active” if we have a purchaser; otherwise all gray
  const hasBuyer = hasPurchaser(lot);

  const thirdStatus = hasBuyer ? walkStatusFromDate(lot.thirdPartyDate)     : 'none';
  const firstStatus = hasBuyer ? walkStatusFromDate(lot.firstWalkDate)      : 'none';
  const finalStatus = hasBuyer ? walkStatusFromDate(lot.finalSignOffDate)   : 'none';

  wrap.appendChild(walkDot(thirdStatus, '3rd Party', lot.thirdPartyDate));
  wrap.appendChild(walkDot(firstStatus, '1st Walk', lot.firstWalkDate));
  wrap.appendChild(walkDot(finalStatus, 'Final Sign Off', lot.finalSignOffDate));

  td.appendChild(wrap);
  return td;
}

// ---------- filtering (single source of truth) ----------
// check if purchaser is linked
function hasPurchaser(lot) {
  return Boolean(getPurchaserMeta(lot).name);
}

// SPEC = under construction OR finished, AND no purchaser
function isSpec(lot) {
  const statuses = [
    lot.buildingStatus,
    lot.constructionStatus,
    lot.homeStatus,
    lot.status
  ].map(v => (v ?? '').toString().toLowerCase());

  const underOrFinished = statuses.some(s =>
    s.includes('under construction') ||
    s.includes('under-construction') ||
    s.includes('construction') ||
    s.includes('spec') ||
    s.includes('finished') ||
    s.includes('complete') ||
    s.includes('completed')
  );

  return underOrFinished && !hasPurchaser(lot);
}

// Sold = any stage, but has purchaser
function isSold(lot) {
  return hasPurchaser(lot);
}

export function applyClientFilters(lots, filtersSet) {
  if (!filtersSet || filtersSet.size === 0) return lots;
  const wantSpec = filtersSet.has('spec');
  const wantSold = filtersSet.has('sold');
  if (!wantSpec && !wantSold) return lots;

  return lots.filter(lot => {
    const spec = isSpec(lot);
    const sold = isSold(lot);
    if (wantSpec && wantSold) return spec || sold;
    if (wantSpec) return spec;
    if (wantSold) return sold;
    return true;
  });
}

// ---------- exports used by index.js / events.js ----------
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

    // 1) Actions column: task / flag / comment
    row.appendChild(actionsCell(lot));

    // 2) Job # (sticky #1)
    {
      const td = twoLineCell(lot.jobNumber || '—', '', true);
      td.classList.add('sticky-col', 'sc-1');
      row.appendChild(td);
    }

    // 3) Lot / Block (Phase as sub) (sticky #2)
    {
      const top = [lot.lot, lot.block].filter(Boolean).join(' • ') || '—';
      const sub = lot.phase ? `Phase ${lot.phase}` : '';
      const td = twoLineCell(top, sub);
      td.classList.add('sticky-col', 'sc-2');
      row.appendChild(td);
    }

    // 4) Address (with purchaser under) (sticky #3)
    row.appendChild(addressCell(lot));

    // 5) Plan / Elv (object-safe names)
    {
      const plan = getPlanName(lot);
      const elv  = getElevationName(lot);
      const top  = [plan, elv].filter(Boolean).join(' • ') || '—';
      row.appendChild(twoLineCell(top, ''));
    }

    // 6) Status split: General + Building
    row.appendChild(statusSplitCell(lot));



    // 7) Timeline
    row.appendChild(timelineCell({
      releaseDate: lot.releaseDate,
      expectedCompletionDate: lot.expectedCompletionDate,
      firstWalkDate: lot.firstWalkDate,
      finalSignOffDate: lot.finalSignOffDate
    }));
function pickDate(...cands) {
  for (const v of cands) {
    if (v == null) continue;
    if (v instanceof Date) return v;
    if (typeof v === 'number') {
      const d = new Date(v);
      if (!isNaN(d)) return d;
    }
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s) continue;
      const d = new Date(s);
      if (!isNaN(d)) return d;
    }
    if (typeof v === 'object') {
      const inner = v.date || v.when || v.start || v.value;
      if (inner) {
        const d = new Date(inner);
        if (!isNaN(d)) return d;
      }
    }
  }
  return null;
}

function getWalkDates(lot) {
  return {
    third: pickDate(
      lot.thirdPartyDate,
      lot.thirdParty,
      lot.thirdPartyWalkDate,
      lot.thirdPartyInspectionDate,
      lot.thirdPartyScheduledDate,
      lot.walk3Date
    ),
    first: pickDate(
      lot.firstWalkDate,
      lot.firstWalk,
      lot.firstWalkScheduledDate,
      lot.walk1Date
    ),
    final: pickDate(
      lot.finalSignOffDate,
      lot.finalWalkDate,
      lot.finalSignOff,
      lot.finalWalkScheduledDate,
      lot.walkFinalDate,
      lot.walk2Date
    ),
  };
}

// map a date to a status token
function walkStatusFromDate(d) {
  if (!d) return 'none'; // scheduled? -> red if purchaser, else gray via 'inactive'
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return 'none';
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d0 = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  if (d0.getTime() === t0.getTime()) return 'today';   // yellow
  if (d0.getTime() > t0.getTime())  return 'future';  // blue
  return 'past';                                      // green
}

function walkDot(status, label, dateVal) {
  const span = document.createElement('span');
  span.className = `dot dot-${status}`;
  const when = dateVal ? fmtDate(dateVal) : 'Not scheduled';
  span.title = `${label}: ${when}`;
  span.dataset.tooltip = label;
  span.setAttribute('aria-label', `${label}: ${when}`);
  span.tabIndex = 0;
  return span;
}

// 3-dot cell using purchaser + dates
function walksCell(lot) {
  const td = document.createElement('td');
  const wrap = document.createElement('div');
  wrap.className = 'walk-dots';

  const hasBuyer = hasPurchaser(lot);
  const { third, first, final } = getWalkDates(lot);

  const thirdStatus = hasBuyer ? walkStatusFromDate(third) : 'inactive';
  const firstStatus = hasBuyer ? walkStatusFromDate(first) : 'inactive';
  const finalStatus = hasBuyer ? walkStatusFromDate(final) : 'inactive';

  wrap.appendChild(walkDot(thirdStatus, '3rd Party', third));
  wrap.appendChild(walkDot(firstStatus, '1st Walk', first));
  wrap.appendChild(walkDot(finalStatus, 'Final Sign Off', final));

  td.appendChild(wrap);
  return td;
}
    // 8) Walks
    row.appendChild(walksCell(lot));

    // 9) Closing
    {
      const closingDate = pickDate(
        lot.closeDateTime,
        lot.closingDateTime,
        lot.closeDate,
        lot.closingDate
      );
      const top = fmtDate(closingDate) || '-';
      const rawTime = trimToString(lot.closingTime || lot.closeTime);
      const timePart = rawTime || fmtTime(closingDate);
      const sub = timePart ? `@ ${timePart}` : '';
      row.appendChild(twoLineCell(top, sub));
    }

    // 10) Price (right-aligned, robust fallbacks)
    row.appendChild(priceCell(lot));

    tbody.appendChild(row);
  });
}


