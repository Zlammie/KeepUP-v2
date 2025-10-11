// /client/assets/js/competition-dashboard/index.js
const body = document.body;
const preId = body.dataset.communityId || '';

const dd = document.getElementById('dashCommunity');
const monthsEl = document.getElementById('dashMonths');
const refreshBtn = document.getElementById('dashRefresh');

const linkedWrap = document.getElementById('dashLinkedBuilders');
const myCommunityColorWrap = document.getElementById('myCommunityColorWrap');

const qmiSoldsCanvas = document.getElementById('qmiSoldsChart');
const salesPieCanvas = document.getElementById('salesPieChart');
const baseCanvas     = document.getElementById('basePriceChart');
const baseChartWrap  = document.getElementById('baseChartWrap');
const baseTableWrap  = document.getElementById('baseTableWrap');
const baseTable      = document.getElementById('baseTable');
const baseMonthEl    = document.getElementById('baseMonth');
const toggleBaseMode = document.getElementById('toggleBaseMode');

const lotCountsTableBody = document.getElementById('lotCountsTableBody');
const lotCountsCardWrap  = document.getElementById('lotCountsCardWrap');
const lotCountsCard      = document.getElementById('lotCountsCard');
const lotCountsToggleBtn = document.getElementById('lotCountsToggle');

const salesWindowEl = document.getElementById('dashSalesWindow');

const communityMetaMap = new Map();

let currentCharts = [];
let lotCountsOverlayEl = null;
let lotCountsExpanded = false;
let lotCountsEscListener = null;

// ---------- builder color management ----------
const BUILDER_COLOR_STORAGE_KEY = 'competitionDashBuilderColors';
const builderColorMap = new Map();
let builderColorsLoaded = false;

function normalizeId(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function loadBuilderColors() {
  if (builderColorsLoaded) return;
  builderColorsLoaded = true;
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(BUILDER_COLOR_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    Object.entries(data || {}).forEach(([key, value]) => {
      if (typeof key === 'string' && typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) {
        builderColorMap.set(key, value);
      }
    });
  } catch (err) {
    console.warn('Failed to load builder colors:', err);
  }
}

function saveBuilderColors() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    const payload = {};
    builderColorMap.forEach((value, key) => {
      payload[key] = value;
    });
    window.localStorage.setItem(BUILDER_COLOR_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save builder colors:', err);
  }
}

function setStoredBuilderColor(id, color) {
  if (!id || !color || !/^#[0-9a-f]{6}$/i.test(color)) return;
  loadBuilderColors();
  builderColorMap.set(String(id), color);
  saveBuilderColors();
}

function getStoredBuilderColor(id) {
  if (!id) return null;
  loadBuilderColors();
  return builderColorMap.get(String(id)) || null;
}

function hslToHex(h, s, l) {
  let _h = h;
  let _s = s;
  let _l = l;
  _h = (_h % 360 + 360) % 360;
  _s = Math.min(Math.max(_s, 0), 100) / 100;
  _l = Math.min(Math.max(_l, 0), 100) / 100;

  const c = (1 - Math.abs(2 * _l - 1)) * _s;
  const x = c * (1 - Math.abs(((_h / 60) % 2) - 1));
  const m = _l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (_h < 60) { r = c; g = x; b = 0; }
  else if (_h < 120) { r = x; g = c; b = 0; }
  else if (_h < 180) { r = 0; g = c; b = x; }
  else if (_h < 240) { r = 0; g = x; b = c; }
  else if (_h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function stringToColor(str) {
  const input = String(str || '').trim();
  if (!input) return '#3b82f6';
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 60, 55);
}

function resolveBuilderColor(id, label, fallback) {
  const stored = getStoredBuilderColor(id);
  if (stored) return stored;
  if (typeof fallback === 'string' && /^#[0-9a-f]{3,6}$/i.test(fallback)) {
    return fallback.length === 4
      ? `#${[...fallback.slice(1)].map(ch => ch + ch).join('')}`
      : fallback;
  }
  return stringToColor(id || label);
}

function normalizeHex6(hex) {
  if (typeof hex !== 'string') return '';
  const trimmed = hex.trim();
  if (!/^#[0-9a-f]{3,6}$/i.test(trimmed)) return '';
  if (trimmed.length === 7) return trimmed.toLowerCase();
  if (trimmed.length === 4) {
    const expanded = [...trimmed.slice(1)].map(ch => ch + ch).join('');
    return `#${expanded.toLowerCase()}`;
  }
  return '';
}

function hexToRgb(hex) {
  const normalized = normalizeHex6(hex).slice(1);
  if (!normalized) return null;
  const intVal = parseInt(normalized, 16);
  if (Number.isNaN(intVal)) return null;
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255
  };
}

function lightenColor(hex, amount = 0.4) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = Math.min(1, Math.max(0, amount));
  const channel = (value) => Math.round(value + (255 - value) * t);
  const r = channel(rgb.r).toString(16).padStart(2, '0');
  const g = channel(rgb.g).toString(16).padStart(2, '0');
  const b = channel(rgb.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function emitBuilderColorChange(detail) {
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.CustomEvent === 'undefined') {
    return;
  }
  try {
    const event = new window.CustomEvent('competitionDash:builderColorChange', { detail });
    document.dispatchEvent(event);
  } catch (err) {
    console.warn('Failed to emit builder color change event:', err);
  }
}

function parseOptionLabel(label) {
  const str = typeof label === 'string' ? label.trim() : '';
  if (!str) return { company: '', community: '', full: '' };
  const parts = str.split(' - ').map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { company: parts[0], community: parts.slice(1).join(' - '), full: str };
  }
  return { company: '', community: str, full: str };
}

function colorStorageKey(id, role = 'linked') {
  const base = String(id || '').trim();
  if (!base) return '';
  if (role === 'primary') return `primary:${base}`;
  return base;
}

function createColorChip({
  entityId,
  role = 'linked',
  companyName,
  communityName,
  providedColor,
  fallbackKey,
  swatchLabel
}) {
  const idStr = String(entityId || '').trim();
  const storageKey = colorStorageKey(idStr || fallbackKey || 'item', role);
  const fallbackLabel = fallbackKey || companyName || communityName || idStr;
  const baseColor = resolveBuilderColor(storageKey, fallbackLabel, providedColor);

  const chip = document.createElement('span');
  chip.className = 'badge rounded-pill text-bg-secondary text-start lh-sm px-3 py-2 d-flex align-items-center gap-2';
  chip.style.flexWrap = 'nowrap';
  chip.style.display = 'flex';
  chip.style.alignItems = 'center';
  chip.style.gap = '0.6rem';
  chip.dataset.storageKey = storageKey;
  chip.dataset.entityId = idStr;
  chip.dataset.role = role;
  chip.dataset.color = baseColor;

  if (role === 'linked') {
    chip.dataset.builderId = idStr;
  } else if (role === 'primary') {
    chip.dataset.communityId = idStr;
  }

  if (idStr) {
    setCommunityMeta(idStr, {
      storageKey,
      role,
      colorHex: baseColor,
      builderName: companyName,
      company: companyName,
      communityName: communityName || fallbackLabel,
      label: fallbackLabel
    });
  }

  const swatchBtn = document.createElement('button');
  swatchBtn.type = 'button';
  swatchBtn.className = 'builder-color-swatch border rounded';
  swatchBtn.style.width = '18px';
  swatchBtn.style.height = '18px';
  swatchBtn.style.padding = '0';
  swatchBtn.style.borderRadius = '4px';
  swatchBtn.style.border = '1px solid rgba(0,0,0,0.25)';
  swatchBtn.style.flex = '0 0 auto';
  swatchBtn.style.backgroundColor = baseColor;
  swatchBtn.style.cursor = 'pointer';
  const buttonLabel = swatchLabel || `Change color for ${companyName || communityName || 'item'}`;
  swatchBtn.setAttribute('aria-label', buttonLabel);
  swatchBtn.title = buttonLabel;
  swatchBtn.dataset.storageKey = storageKey;
  swatchBtn.dataset.entityId = idStr;
  if (role === 'linked') {
    swatchBtn.dataset.builderId = idStr;
  } else if (role === 'primary') {
    swatchBtn.dataset.communityId = idStr;
  }

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = baseColor;
  colorInput.className = 'visually-hidden';
  colorInput.setAttribute('aria-label', `Choose color for ${companyName || communityName || 'item'}`);
  colorInput.dataset.storageKey = storageKey;
  colorInput.dataset.entityId = idStr;
  if (role === 'linked') {
    colorInput.dataset.builderId = idStr;
  } else if (role === 'primary') {
    colorInput.dataset.communityId = idStr;
  }

  swatchBtn.addEventListener('click', (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    colorInput.click();
  });

  colorInput.addEventListener('input', (evt) => {
    const newColor = evt.target.value;
    if (typeof newColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(newColor)) {
      return;
    }
    swatchBtn.style.backgroundColor = newColor;
    chip.dataset.color = newColor;
    setStoredBuilderColor(storageKey, newColor);
    if (idStr) {
      setCommunityMeta(idStr, {
        colorHex: newColor,
        chartColors: {
          qmi: newColor,
          sold: lightenColor(newColor, 0.45),
          basePrice: newColor,
          sales: newColor
        }
      });
    }
    emitBuilderColorChange({
      id: idStr,
      color: newColor,
      company: companyName || '',
      community: communityName || '',
      role,
      storageKey
    });
  });

  const textWrap = document.createElement('span');
  textWrap.className = 'd-flex flex-column text-start lh-sm';

  const companyEl = document.createElement('span');
  companyEl.className = 'fw-semibold';
  companyEl.textContent = companyName || communityName || 'Item';
  textWrap.appendChild(companyEl);

  if (communityName && communityName !== companyName) {
    const communityEl = document.createElement('span');
    communityEl.className = 'small opacity-75';
    communityEl.textContent = communityName;
    textWrap.appendChild(communityEl);
  }

  chip.appendChild(swatchBtn);
  chip.appendChild(textWrap);
  chip.appendChild(colorInput);
  return chip;
}

function setCommunityMeta(id, meta = {}) {
  const key = String(id || '').trim();
  if (!key || typeof meta !== 'object' || meta === null) return;
  const current = communityMetaMap.get(key) || {};
  communityMetaMap.set(key, { ...current, ...meta });
}

function getCommunityMeta(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  return communityMetaMap.get(key) || null;
}

function getCommunityColorConfig({ id, label, providedColor, role = 'linked' }) {
  const normalizedId = normalizeId(id);
  const effectiveRole = role === 'primary' ? 'primary' : 'linked';
  const meta = normalizedId ? (getCommunityMeta(normalizedId) || {}) : {};
  const fallbackLabel = label || meta.label || meta.communityName || meta.name || meta.optionLabel || `Community ${normalizedId || ''}`;
  const colorSource = providedColor || meta.colorHex || meta.color || meta.themeColor || meta.primaryColor;
  const storageKey = colorStorageKey(normalizedId || fallbackLabel || 'item', effectiveRole);
  const baseColor = resolveBuilderColor(storageKey, fallbackLabel, colorSource);
  const soldColor = lightenColor(baseColor, 0.45);

  if (normalizedId) {
    setCommunityMeta(normalizedId, {
      storageKey,
      role: effectiveRole,
      colorHex: baseColor,
      chartColors: {
        qmi: baseColor,
        sold: soldColor,
        basePrice: baseColor,
        sales: baseColor
      }
    });
  }

  return {
    storageKey,
    baseColor,
    soldColor
  };
}

function resolvePrimaryCommunityInfo(communityId, profile) {
  const idStr = String(communityId || '').trim();
  if (!idStr) return null;

  const meta = getCommunityMeta(idStr) || {};
  const selectedOption = dd && typeof dd.selectedIndex === 'number' && dd.selectedIndex >= 0
    ? dd.options[dd.selectedIndex]
    : null;
  const optionLabel = selectedOption
    ? selectedOption.textContent.trim()
    : (meta.optionLabel || meta.label || '');
  if (optionLabel) {
    setCommunityMeta(idStr, { optionLabel });
  }

  const parsedOption = parseOptionLabel(optionLabel);

  let companyName = profile?.builderName || profile?.builder
    || meta.builderName || meta.builder
    || meta.company || meta.companyName
    || parsedOption.company || '';
  if (!companyName && profile?.company) {
    if (typeof profile.company === 'string') {
      companyName = profile.company;
    } else if (profile.company?.name) {
      companyName = profile.company.name;
    }
  }

  let communityName = profile?.communityName
    || meta.communityName || meta.name
    || parsedOption.community || '';

  if (!communityName && optionLabel) {
    communityName = optionLabel;
  }

  if (companyName && communityName && companyName.toLowerCase() === communityName.toLowerCase()) {
    communityName = '';
  }

  const fallbackLabel = optionLabel || communityName || companyName || `community-${idStr}`;
  const providedColor = profile?.colorHex || profile?.color || profile?.themeColor
    || meta.colorHex || meta.color || meta.themeColor || meta.primaryColor;

  return {
    companyName: companyName || communityName || 'My Community',
    communityName,
    fallbackLabel,
    providedColor
  };
}

function renderPrimaryCommunityChip(communityId, profile) {
  if (!myCommunityColorWrap) return;
  myCommunityColorWrap.innerHTML = '';

  const idStr = String(communityId || '').trim();
  if (!idStr) {
    const placeholder = document.createElement('span');
    placeholder.className = 'text-muted small';
    placeholder.textContent = 'Select a community to edit its color.';
    myCommunityColorWrap.appendChild(placeholder);
    return;
  }

  const info = resolvePrimaryCommunityInfo(idStr, profile);
  if (!info) return;

  const chip = createColorChip({
    entityId: idStr,
    role: 'primary',
    companyName: info.companyName,
    communityName: info.communityName,
    providedColor: info.providedColor,
    fallbackKey: info.fallbackLabel,
    swatchLabel: `Change color for ${info.companyName || 'My Community'}`
  });

  myCommunityColorWrap.appendChild(chip);
}

function ensureLotCountsOverlay() {
  if (lotCountsOverlayEl && lotCountsOverlayEl.isConnected) {
    return lotCountsOverlayEl;
  }
  const overlay = document.createElement('div');
  overlay.id = 'lotCountsOverlay';
  overlay.className = 'expandable-table-overlay';
  overlay.addEventListener('click', () => collapseLotCounts());
  lotCountsOverlayEl = overlay;
  return overlay;
}

function expandLotCounts() {
  if (!lotCountsCard || lotCountsExpanded) return;

  const placeholderHeight = lotCountsCardWrap?.offsetHeight || lotCountsCard.offsetHeight || 0;
  if (lotCountsCardWrap) {
    lotCountsCardWrap.style.minHeight = `${placeholderHeight}px`;
  }

  const overlay = ensureLotCountsOverlay();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  lotCountsCard.classList.add('is-expanded');
  document.body.classList.add('expandable-table-expanded');

  if (lotCountsToggleBtn) {
    lotCountsToggleBtn.setAttribute('aria-expanded', 'true');
    lotCountsToggleBtn.setAttribute('aria-label', 'Collapse lot counts table');
    const sr = lotCountsToggleBtn.querySelector('.visually-hidden');
    if (sr) sr.textContent = 'Collapse lot counts table';
    const icon = lotCountsToggleBtn.querySelector('.expandable-table-toggle-icon');
    if (icon) icon.textContent = '[x]';
  }

  lotCountsExpanded = true;
  lotCountsEscListener = (event) => {
    if (event.key === 'Escape') {
      collapseLotCounts();
    }
  };
  document.addEventListener('keydown', lotCountsEscListener);
}

function collapseLotCounts(options = {}) {
  if (!lotCountsCard || !lotCountsExpanded) return;

  lotCountsExpanded = false;
  lotCountsCard.classList.remove('is-expanded');
  if (!document.querySelector('.expandable-table-card.is-expanded')) {
    document.body.classList.remove('expandable-table-expanded');
  }

  if (lotCountsCardWrap) {
    lotCountsCardWrap.style.minHeight = '';
  }

  if (lotCountsToggleBtn) {
    lotCountsToggleBtn.setAttribute('aria-expanded', 'false');
    lotCountsToggleBtn.setAttribute('aria-label', 'Expand lot counts table');
    const sr = lotCountsToggleBtn.querySelector('.visually-hidden');
    if (sr) sr.textContent = 'Expand lot counts table';
    const icon = lotCountsToggleBtn.querySelector('.expandable-table-toggle-icon');
    if (icon) icon.textContent = '[+]';
    if (options.focusToggle !== false) {
      lotCountsToggleBtn.focus();
    }
  }

  const overlay = lotCountsOverlayEl;
  lotCountsOverlayEl = null;
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }

  if (lotCountsEscListener) {
    document.removeEventListener('keydown', lotCountsEscListener);
    lotCountsEscListener = null;
  }
}

function toggleLotCounts() {
  if (lotCountsExpanded) {
    collapseLotCounts();
  } else {
    expandLotCounts();
  }
}

async function fetchLotStatsForIds(ids) {
  const seen = new Set();
  const tasks = [];
  ids.forEach(rawId => {
    const id = normalizeId(rawId);
    if (!id || seen.has(id)) return;
    seen.add(id);
    tasks.push((async () => {
      try {
        const stats = await getJSON(`/api/communities/${encodeURIComponent(id)}/lot-stats`);
        return { id, stats };
      } catch (error) {
        console.error('[lot-stats] failed for', id, error);
        return { id, error: true, stats: null };
      }
    })());
  });
  return Promise.all(tasks);
}

function formatLotStat(value, fallback = '--') {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString() : fallback;
}

function renderLotCountsTable(orderIds, statsResults, primaryId) {
  if (!lotCountsTableBody) return;
  lotCountsTableBody.innerHTML = '';

  const statsMap = new Map(
    (Array.isArray(statsResults) ? statsResults : [])
      .filter(Boolean)
      .map(entry => [normalizeId(entry.id), entry])
  );

  if (!Array.isArray(orderIds) || !orderIds.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'text-center text-muted small';
    cell.textContent = 'No communities selected.';
    row.appendChild(cell);
    lotCountsTableBody.appendChild(row);
    return;
  }

  const seenRows = new Set();
  let rowCount = 0;

  orderIds.forEach(rawId => {
    const id = normalizeId(rawId);
    if (!id || seenRows.has(id)) return;
    seenRows.add(id);

    const statsEntry = statsMap.get(id) || {};
    const stats = statsEntry.stats || {};
    const hadError = Boolean(statsEntry.error);

    const meta = getCommunityMeta(id) || {};
    const isPrimary = normalizeId(primaryId) === id;

    const companyName = meta.builderName || meta.builder || meta.company || '';
    const communityName = meta.communityName || meta.name || '';
    const label = meta.label || (companyName && communityName ? `${companyName} - ${communityName}` : (communityName || companyName || `Community ${rowCount + 1}`));

    const colorConfig = getCommunityColorConfig({
      id,
      label,
      providedColor: meta.colorHex || meta.color || meta.themeColor || meta.primaryColor,
      role: isPrimary ? 'primary' : 'linked'
    });
    const rowColor = colorConfig.baseColor || '#6c757d';

    const storageKey = colorConfig.storageKey || colorStorageKey(id, isPrimary ? 'primary' : 'linked');

    const row = document.createElement('tr');
    row.dataset.communityId = id;
    row.dataset.storageKey = storageKey;
    row.dataset.role = isPrimary ? 'primary' : 'linked';
    row.dataset.color = rowColor;

    const nameCell = document.createElement('td');
    const nameWrap = document.createElement('div');
    nameWrap.className = 'd-flex align-items-start gap-2';

    const colorDot = document.createElement('span');
    colorDot.className = 'lot-color-dot rounded-circle flex-shrink-0';
    colorDot.style.width = '12px';
    colorDot.style.height = '12px';
    colorDot.style.marginTop = '0.35rem';
    colorDot.style.backgroundColor = rowColor;
    colorDot.style.border = '1px solid rgba(0,0,0,0.2)';
    colorDot.dataset.role = row.dataset.role;
    nameWrap.appendChild(colorDot);

    const textWrap = document.createElement('div');
    textWrap.className = 'd-flex flex-column';

    const builderLine = document.createElement('span');
    builderLine.className = 'fw-semibold';
    builderLine.textContent = companyName || label || `Community ${rowCount + 1}`;

    const badgeWrap = document.createElement('div');
    badgeWrap.className = 'd-flex align-items-center gap-2';
    badgeWrap.appendChild(builderLine);

    if (isPrimary) {
      const badge = document.createElement('span');
      badge.className = 'badge text-bg-light border';
      badge.textContent = 'My Community';
      badgeWrap.appendChild(badge);
    }

    textWrap.appendChild(badgeWrap);

    const communityLineText = communityName && communityName !== builderLine.textContent
      ? communityName
      : (communityName || '');
    if (communityLineText) {
      const communityLine = document.createElement('span');
      communityLine.className = 'small text-muted';
      communityLine.textContent = communityLineText;
      textWrap.appendChild(communityLine);
    }

    nameWrap.appendChild(textWrap);
    nameCell.appendChild(nameWrap);
    row.appendChild(nameCell);

    const fallback = hadError ? 'Err' : '--';
    const cells = [
      stats?.total,
      stats?.sold,
      stats?.remaining,
      stats?.quickMoveInLots ?? stats?.quickMoveIns
    ];

    cells.forEach(value => {
      const cell = document.createElement('td');
      cell.className = 'text-end';
      cell.textContent = formatLotStat(value, fallback);
      row.appendChild(cell);
    });

    lotCountsTableBody.appendChild(row);
    rowCount += 1;
  });

  if (!rowCount) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'text-center text-muted small';
    cell.textContent = 'No lot count data available.';
    row.appendChild(cell);
    lotCountsTableBody.appendChild(row);
  }
}

function updateScatterDatasetColors(storageKey, baseColor) {
  if (!storageKey || !baseColor) return;
  const normalizedBase = normalizeHex6(baseColor) || baseColor;
  const soldColor = lightenColor(normalizedBase, 0.45);
  const soldBorderColor = '#dc2626';

  currentCharts.forEach(chart => {
    if (!chart?.data?.datasets) return;
    let dirty = false;
    chart.data.datasets.forEach(ds => {
      if (ds?.keepupStorageKey !== storageKey) return;
      if (ds.keepupSeries === 'qmi') {
        ds.pointBackgroundColor = normalizedBase;
        ds.pointBorderColor = normalizedBase;
        ds.pointHoverBackgroundColor = normalizedBase;
        ds.pointHoverBorderColor = normalizedBase;
        dirty = true;
      } else if (ds.keepupSeries === 'sold') {
        ds.pointBackgroundColor = soldColor;
        ds.pointHoverBackgroundColor = soldColor;
        ds.pointBorderColor = soldBorderColor;
        ds.pointHoverBorderColor = soldBorderColor;
        dirty = true;
      }
    });
    if (dirty) {
      chart.update('none');
    }
  });
}

function updateBasePriceDatasetColors(storageKey, baseColor) {
  if (!storageKey || !baseColor) return;
  const color = normalizeHex6(baseColor) || baseColor;

  currentCharts.forEach(chart => {
    if (!chart?.data?.datasets) return;
    let dirty = false;
    chart.data.datasets.forEach(ds => {
      if (ds?.keepupSeries === 'basePrice' && ds?.keepupStorageKey === storageKey) {
        ds.borderColor = color;
        ds.backgroundColor = color;
        ds.pointBackgroundColor = color;
        ds.pointBorderColor = color;
        dirty = true;
      }
    });
    if (dirty) {
      chart.update('none');
    }
  });
}

function updateSalesPieColors(storageKey, baseColor) {
  if (!storageKey || !baseColor) return;
  const color = normalizeHex6(baseColor) || baseColor;

  currentCharts.forEach(chart => {
    if (!chart?.data?.datasets) return;
    let dirty = false;
    chart.data.datasets.forEach(ds => {
      if (ds?.keepupSeries !== 'salesPie') return;
      if (!Array.isArray(ds.backgroundColor)) return;
      const segments = Array.isArray(ds.keepupSegments) ? ds.keepupSegments : [];
      segments.forEach(seg => {
        if (!seg || seg.storageKey !== storageKey) return;
        const idx = Number(seg.index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= ds.backgroundColor.length) return;
        ds.backgroundColor[idx] = color;
        if (Array.isArray(ds.borderColor)) ds.borderColor[idx] = color;
        if (Array.isArray(ds.hoverBackgroundColor)) ds.hoverBackgroundColor[idx] = color;
        if (Array.isArray(ds.hoverBorderColor)) ds.hoverBorderColor[idx] = color;
        dirty = true;
      });
    });
    if (dirty) {
      chart.update('none');
    }
  });
}

function updateLotTableColors(storageKey, baseColor) {
  if (!lotCountsTableBody || !storageKey || !baseColor) return;
  const normalized = normalizeHex6(baseColor) || baseColor;
  lotCountsTableBody.querySelectorAll('tr').forEach(row => {
    if (row.dataset.storageKey !== storageKey) return;
    row.dataset.color = normalized;
    const dot = row.querySelector('.lot-color-dot');
    if (dot) dot.style.backgroundColor = normalized;
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('competitionDash:builderColorChange', (evt) => {
    const detail = evt?.detail || {};
    const storageKey = detail.storageKey || colorStorageKey(detail.id, detail.role || 'linked');
    const color = detail.color;
    if (!storageKey || !color) return;
    const normalizedId = normalizeId(detail.id);
    if (normalizedId) {
      const existing = getCommunityMeta(normalizedId) || {};
      setCommunityMeta(normalizedId, {
        colorHex: color,
        chartColors: {
          ...(existing.chartColors || {}),
          qmi: color,
          sold: lightenColor(color, 0.45),
          basePrice: color,
          sales: color
        }
      });
    }
    updateScatterDatasetColors(storageKey, color);
    updateBasePriceDatasetColors(storageKey, color);
    updateSalesPieColors(storageKey, color);
    updateLotTableColors(storageKey, color);
  });
}

if (lotCountsToggleBtn && lotCountsCard) {
  lotCountsToggleBtn.addEventListener('click', toggleLotCounts);
}

// ---------- helpers ----------
function destroyCharts() {
  currentCharts.forEach(ch => ch?.destroy?.());
  currentCharts = [];
}
function dollars(v) { return v == null ? 'n/a' : `$${Number(v).toLocaleString()}`; }
function commify(v) { return Number(v).toLocaleString(); }
function friendlyMonthLabel(value) {
  if (!value) return '';
  const str = String(value).trim();

  const parts = str.split('-');
  if (parts.length >= 2) {
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 0 && month < 12) {
      const d = new Date(year, month, 1);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
      }
    }
  }

  const d = new Date(str);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString(undefined, { month: 'short', year: 'numeric' });
  }

  return str;
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status} for ${url}\n${text.slice(0, 400)}`);
  }
  return r.json();
}

// ---------- init ----------
(async function init() {
  try {
    const list = await getJSON('/api/communities/select-options');
    list.forEach(c => {
      const id = c._id || c.id;
      if (!id) return;

      const name = c.name || c.communityName || '';
      const builder = c.builder || c.builderName || '';
      const labelBase = name || c.label || String(id);
      const label = c.label || (builder ? `${builder} - ${labelBase}` : labelBase);

      setCommunityMeta(id, {
        label,
        optionLabel: label,
        communityName: name || labelBase,
        builderName: builder,
        builder,
        company: c.company || c.companyName || '',
        colorHex: c.colorHex || c.color || c.themeColor || c.primaryColor || '',
        name: labelBase
      });

      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = label;
      dd.appendChild(opt);
    });
    renderPrimaryCommunityChip(dd.value || '');
    if (preId && list.find(x => x._id === preId)) {
      dd.value = preId;
      await refreshAll();
    }
  } catch (e) {
    console.error('Init failed:', e);
  }
})();

dd.addEventListener('change', () => {
  renderPrimaryCommunityChip(dd.value || '');
  refreshAll();
});
refreshBtn.addEventListener('click', refreshAll);

toggleBaseMode.addEventListener('click', () => {
  const tableMode = !baseTableWrap.classList.contains('d-none');
  if (tableMode) {
    baseTableWrap.classList.add('d-none');
    baseChartWrap.classList.remove('d-none');
    toggleBaseMode.textContent = 'Table';
  } else {
    baseChartWrap.classList.add('d-none');
    baseTableWrap.classList.remove('d-none');
    toggleBaseMode.textContent = 'Chart';
  }
});

if (baseMonthEl) {
  baseMonthEl.addEventListener('change', () => {
    const id = dd.value;
    if (id) drawBasePrice(id).catch(console.error);
  });
}

// ---------- charts ----------
async function drawQmiSoldsMulti(communityIds) {
  if (!Array.isArray(communityIds)) communityIds = [communityIds].filter(Boolean);
  if (!communityIds.length) return;

  const idParam = communityIds.map(id => encodeURIComponent(id)).join(',');
  const url = `/api/communities/multi/qmi-solds-scatter?ids=${idParam}`;
  const res = await getJSON(url);
  if (!Array.isArray(res)) {
    console.warn('Unexpected payload from multi qmi/solds:', res);
    return;
  }

  const planText = (plan) => {
    if (!plan) return '';
    if (typeof plan === 'string') return plan;
    const name = plan?.name ? String(plan.name).trim() : '';
    const num = plan?.planNumber ? String(plan.planNumber).trim() : '';
    if (name && num) return `${name} (#${num})`;
    return name || num;
  };

  const toPoint = (item, primaryKey, secondaryKey) => {
    if (!item) return null;
    const sqft = Number(item.x ?? item.sqft);
    const priceCandidate = item.y ?? item[primaryKey] ?? (secondaryKey ? item[secondaryKey] : undefined);
    const price = Number(priceCandidate);
    if (!Number.isFinite(sqft) || !Number.isFinite(price)) return null;
    return {
      x: sqft,
      y: price,
      plan: planText(item.plan),
      address: item.address || '',
      month: item.month || null
    };
  };

  const datasets = [];
  const primaryId = normalizeId(dd?.value || communityIds[0]);

  res.forEach(entry => {
    const entryId = normalizeId(entry?._id || entry?.id || entry?.communityId || entry?.competitionId || entry?.community);
    const meta = entryId ? (getCommunityMeta(entryId) || {}) : {};
    const isPrimary = entryId && primaryId && entryId === primaryId;
    const role = isPrimary ? 'primary' : 'linked';

    const companyName = entry?.builderName || entry?.builder || meta.builderName || meta.builder || meta.company || '';
    const communityName = entry?.communityName || entry?.name || meta.communityName || meta.name || '';
    const baseLabel = entry?.label || (companyName && communityName ? `${companyName} - ${communityName}` : (communityName || companyName || entryId || 'Community'));

    if (entryId) {
      setCommunityMeta(entryId, {
        label: baseLabel,
        builderName: companyName || undefined,
        builder: companyName || undefined,
        company: meta.company || companyName || undefined,
        communityName: communityName || meta.communityName || undefined,
        name: communityName || meta.name || undefined
      });
    }

    const colorConfig = getCommunityColorConfig({
      id: entryId || baseLabel,
      label: baseLabel,
      providedColor: entry?.colorHex || entry?.color || entry?.themeColor || entry?.primaryColor,
      role
    });
    const qmiColor = colorConfig.baseColor;
    const soldColor = colorConfig.soldColor;
    const soldBorderColor = '#dc2626';

    const qmiPoints = (entry.qmi || [])
      .map(item => toPoint(item, 'listPrice', 'soldPrice'))
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    if (qmiPoints.length) {
      datasets.push({
        label: `${baseLabel} - Quick Move-Ins`,
        type: 'scatter',
        data: qmiPoints,
        pointRadius: 4,
        pointHoverRadius: 5,
        pointHitRadius: 8,
        pointBackgroundColor: qmiColor,
        pointBorderColor: qmiColor,
        pointHoverBackgroundColor: qmiColor,
        pointHoverBorderColor: qmiColor,
        pointBorderWidth: 1.5,
        showLine: false,
        tension: 0.15,
        keepupSeries: 'qmi',
        keepupStorageKey: colorConfig.storageKey
      });
    }

    const soldPoints = (entry.sold || [])
      .map(item => toPoint(item, 'soldPrice', 'listPrice'))
      .filter(Boolean)
      .sort((a, b) => a.x - b.x);
    if (soldPoints.length) {
      datasets.push({
        label: `${baseLabel} - SOLD`,
        type: 'scatter',
        data: soldPoints,
        pointRadius: 4,
        pointHoverRadius: 5,
        pointHitRadius: 8,
        pointBackgroundColor: soldColor,
        pointBorderColor: soldBorderColor,
        pointHoverBackgroundColor: soldColor,
        pointHoverBorderColor: soldBorderColor,
        pointBorderWidth: 2,
        showLine: false,
        tension: 0.15,
        keepupSeries: 'sold',
        keepupStorageKey: colorConfig.storageKey
      });
    }
  });

  const ctx = qmiSoldsCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    data: { datasets },
    options: {
      responsive: true, maintainAspectRatio: false, parsing: false,
      plugins: { legend: { position: 'top' }, tooltip: { callbacks: {
        label: (ctx) => {
          const d = ctx.raw;
          const sqft = Number(d.x).toLocaleString();
          const price = `$${Number(d.y).toLocaleString()}`;
          const plan  = d.plan ? ` - ${d.plan}` : '';
          const addr  = d.address ? `\n${d.address}` : '';
          const month = d.month ? `\nMonth: ${d.month}` : '';
          return `${ctx.dataset.label}${plan}: ${price} @ ${sqft} sqft${addr}${month}`;
        }
      }}},
      scales: {
        x: { title: { display: true, text: 'Square Feet' }, ticks: { callback: v => Number(v).toLocaleString() } },
        y: { title: { display: true, text: 'Price ($)' },   ticks: { callback: v => `$${Number(v).toLocaleString()}` } }
      }
    }
  });
  currentCharts.push(chart);
}

async function drawSalesPie(communityId, months) {
  const res = await getJSON(`/api/community-profiles/${communityId}/sales?months=${months}`);
  const s = res.series || { sales:[], cancels:[], closings:[] };
  const totalSales   = (s.sales   || []).reduce((a,b)=>a+(+b||0),0);
  const totalCancels = (s.cancels || []).reduce((a,b)=>a+(+b||0),0);
  const totalClose   = (s.closings|| []).reduce((a,b)=>a+(+b||0),0);

  const ctx = salesPieCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'pie',
    data: { labels: ['Sales', 'Cancels', 'Closings'], datasets: [{ data: [totalSales, totalCancels, totalClose] }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
  currentCharts.push(chart);
}

async function drawSalesTotalsPie(communityOrCompetitionIds, windowKey) {
  if (!salesPieCanvas) return;
  if (!Array.isArray(communityOrCompetitionIds)) communityOrCompetitionIds = [communityOrCompetitionIds].filter(Boolean);
  if (!communityOrCompetitionIds.length) return;

  const idsParam = communityOrCompetitionIds.map(id => encodeURIComponent(id)).join(',');
  const { labels = [], data = [], breakdown = [] } = await getJSON(`/api/competitions/multi/sales-totals?ids=${idsParam}&window=${encodeURIComponent(windowKey)}`);

  const primaryId = normalizeId(dd?.value);
  const count = Math.max(labels.length, data.length, breakdown.length, communityOrCompetitionIds.length);
  const segments = Array.from({ length: count }, (_, idx) => {
    const info = breakdown[idx] || {};
    const labelInput = labels[idx] ?? info?.label ?? info?.communityName ?? info?.builderName ?? info?.builder ?? info?.name;
    const label = typeof labelInput === 'string' && labelInput.trim()
      ? labelInput.trim()
      : `Community ${idx + 1}`;
    const rawId = info?._id || info?.id || info?.communityId || info?.competitionId || info?.community || communityOrCompetitionIds[idx];
    const id = normalizeId(rawId);
    const role = id && primaryId && id === primaryId ? 'primary' : 'linked';
    if (id) {
      setCommunityMeta(id, {
        label: label || info?.label || undefined,
        communityName: info?.communityName || info?.name || info?.label || undefined,
        builderName: info?.builderName || info?.builder || undefined,
        builder: info?.builder || undefined,
        company: info?.company || info?.builder || undefined,
        colorHex: info?.colorHex || info?.color || info?.themeColor || info?.primaryColor || undefined
      });
    }
    const colorConfig = getCommunityColorConfig({
      id: id || label,
      label,
      providedColor: info?.colorHex || info?.color || info?.themeColor || info?.primaryColor,
      role
    });
    return {
      id,
      label,
      value: Number(data[idx]) || 0,
      color: colorConfig.baseColor,
      storageKey: colorConfig.storageKey
    };
  });

  const chartLabels = segments.map(seg => seg.label);
  const datasetValues = segments.map(seg => seg.value);
  const backgroundColors = segments.map(seg => seg.color);
  const borderColors = backgroundColors.slice();
  const metaSegments = segments.map((_, idx) => breakdown[idx] || null);

  const ctx = salesPieCanvas.getContext('2d');
  const chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: chartLabels,
      datasets: [{
        label: 'Net Sales',
        data: datasetValues,
        meta: metaSegments,
        backgroundColor: backgroundColors,
        borderColor: borderColors,
        hoverBackgroundColor: backgroundColors,
        hoverBorderColor: borderColors,
        borderWidth: 1,
        keepupSeries: 'salesPie',
        keepupSegments: segments.map((seg, index) => ({
          storageKey: seg.storageKey,
          index
        }))
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const value = Number(ctx.parsed) || 0;
              const meta = ctx.dataset.meta?.[ctx.dataIndex] || {};
              const sales = meta?.totals?.sales ?? 0;
              const cancels = meta?.totals?.cancels ?? 0;
              const closings = meta?.totals?.closings ?? 0;
              const parts = [
                `${ctx.label || 'Community'}: ${value}`,
                `Sales: ${sales}`,
                `Cancels: ${cancels}`,
                `Closings: ${closings}`
              ];
              return parts.join(' | ');
            }
          }
        },
        legend: { position: 'top' }
      }
    }
  });
  currentCharts.push(chart);
}

function syncBaseMonthOptions(options, selectedValue) {
  if (!baseMonthEl) return selectedValue || (options[0]?.value ?? '');
  baseMonthEl.innerHTML = '';
  if (!options.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No months available';
    baseMonthEl.appendChild(opt);
    baseMonthEl.disabled = true;
    return '';
  }

  options.forEach(({ value, label }) => {
    if ([...baseMonthEl.options].some(opt => opt.value === value)) return;
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label || value;
    baseMonthEl.appendChild(opt);
  });

  const target = (selectedValue && options.some(o => o.value === selectedValue))
    ? selectedValue
    : options[0].value;
  baseMonthEl.value = target;
  baseMonthEl.disabled = false;
  return target;
}

function renderBaseTable(datasets) {
  if (!baseTable) return;
  baseTable.innerHTML = '';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Community / Builder', 'Plan', 'Sq Ft', 'Base Price'].forEach(title => {
    const th = document.createElement('th');
    th.textContent = title;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  baseTable.appendChild(thead);

  const tbody = document.createElement('tbody');
  const rows = [];

  (datasets || []).forEach(ds => {
    const label = ds?.label || 'Community';
    const points = Array.isArray(ds?.points) ? ds.points.slice() : [];
    points
      .filter(pt => Number.isFinite(pt?.sqft ?? pt?.x) && Number.isFinite(pt?.price ?? pt?.y))
      .sort((a, b) => (a.sqft ?? a.x ?? 0) - (b.sqft ?? b.x ?? 0))
      .forEach(pt => {
        const sqft = Number(pt.sqft ?? pt.x ?? 0);
        const price = Number(pt.price ?? pt.y ?? 0);
        const planName = pt.planName || '';
        const planNumber = pt.planNumber ? ` (#${pt.planNumber})` : '';
        rows.push({
          label,
          plan: planName ? `${planName}${planNumber}` : (pt.planNumber || 'Plan'),
          sqft,
          price
        });
      });
  });

  rows.sort((a, b) => a.label.localeCompare(b.label) || (a.sqft - b.sqft));

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'text-muted';
    td.textContent = 'No base price data available for the selected month.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    rows.forEach(row => {
      const tr = document.createElement('tr');

      const tdLabel = document.createElement('td');
      tdLabel.textContent = row.label;
      tr.appendChild(tdLabel);

      const tdPlan = document.createElement('td');
      tdPlan.textContent = row.plan;
      tr.appendChild(tdPlan);

      const tdSqft = document.createElement('td');
      tdSqft.textContent = commify(row.sqft || 0);
      tr.appendChild(tdSqft);

      const tdPrice = document.createElement('td');
      tdPrice.textContent = dollars(row.price);
      tr.appendChild(tdPrice);

      tbody.appendChild(tr);
    });
  }

  baseTable.appendChild(tbody);
}

async function drawBasePrice(communityId) {
  if (!baseCanvas) return;

  const params = new URLSearchParams();
  if (baseMonthEl?.value) params.set('month', baseMonthEl.value);
  const query = params.toString();

  const res = await getJSON(`/api/community-profiles/${communityId}/base-price-scatter${query ? `?${query}` : ''}`);
  const rawMonths = Array.isArray(res?.months) ? res.months : [];
  const monthOptions = rawMonths
    .map(m => (typeof m === 'string'
      ? { value: m, label: friendlyMonthLabel(m) }
      : { value: m?.value, label: m?.label || friendlyMonthLabel(m?.value || '') }))
    .filter(m => m.value);

  const selectedMonth = syncBaseMonthOptions(monthOptions, res?.selectedMonth);
  const datasets = Array.isArray(res?.datasets) ? res.datasets : [];
  renderBaseTable(datasets);

  const showNoData = (message) => {
    if (!baseChartWrap) return;
    let msg = baseChartWrap.querySelector('.no-data-message');
    if (!msg) {
      msg = document.createElement('div');
      msg.className = 'no-data-message text-muted text-center py-5';
      msg.style.whiteSpace = 'pre-line';
      baseChartWrap.appendChild(msg);
    }
    msg.textContent = message;
    if (baseCanvas) baseCanvas.classList.add('invisible');
  };

  const hideNoData = () => {
    if (!baseChartWrap) return;
    const msg = baseChartWrap.querySelector('.no-data-message');
    if (msg) msg.remove();
    if (baseCanvas) baseCanvas.classList.remove('invisible');
  };

  const existing = Chart.getChart(baseCanvas);
  if (existing) {
    existing.destroy();
    currentCharts = currentCharts.filter(ch => ch !== existing);
  }

  const ctx = baseCanvas.getContext('2d');
  ctx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);

  const chartDatasets = datasets
    .map(ds => {
      const points = Array.isArray(ds?.points) ? ds.points
        .filter(pt => Number.isFinite(pt?.x) && Number.isFinite(pt?.y))
        .sort((a, b) => a.x - b.x)
        : [];
      if (!points.length) return null;

      const dsId = ds?.id || ds?._id || ds?.communityId || ds?.competitionId || ds?.community;
      const label = ds.label || 'Community';
      const colorConfig = getCommunityColorConfig({
        id: dsId || label,
        label,
        providedColor: ds?.colorHex || ds?.color || ds?.themeColor || ds?.primaryColor,
        role: (dsId && normalizeId(dd?.value) === normalizeId(dsId)) ? 'primary' : 'linked'
      });
      const lineColor = colorConfig.baseColor;

      return {
        label,
        data: points,
        type: 'line',
        showLine: true,
        spanGaps: false,
        borderWidth: 2,
        tension: 0.15,
        pointRadius: 4,
        borderColor: lineColor,
        backgroundColor: lineColor,
        pointBackgroundColor: lineColor,
        pointBorderColor: lineColor,
        keepupStorageKey: colorConfig.storageKey,
        keepupSeries: 'basePrice'
      };
    })
    .filter(Boolean);

  if (!chartDatasets.length) {
    showNoData('No base price data available for the selected month.');
    return;
  }

  hideNoData();

  const chart = new Chart(ctx, {
    data: { datasets: chartDatasets },
    options: {
      parsing: false,
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            title: () => friendlyMonthLabel(selectedMonth || ''),
            label: (tooltipCtx) => {
              const d = tooltipCtx.raw || {};
              const sqft = Number(d.x ?? d.sqft ?? 0).toLocaleString();
              const price = `$${Number(d.y ?? d.price ?? 0).toLocaleString()}`;
              const planName = d.planName || '';
              const planNumber = d.planNumber ? ` (#${d.planNumber})` : '';
              const planPart = planName ? ` - ${planName}${planNumber}` : '';
              return `${tooltipCtx.dataset.label}${planPart}: ${price} @ ${sqft} sqft`;
            }
          }
        }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: 'Square Feet' }, ticks: { callback: v => Number(v).toLocaleString() } },
        y: { title: { display: true, text: 'Base Price ($)' }, ticks: { callback: v => `$${Number(v).toLocaleString()}` } }
      }
    }
  });
  currentCharts.push(chart);
}


// ---------- UI ----------
function renderLinked(list) {
  linkedWrap.innerHTML = '';
  if (!list.length) {
    linkedWrap.innerHTML = '<span class="text-muted">No builders linked.</span>';
    return;
  }
  list.forEach((entry, idx) => {
    const companyName = entry?.builderName || entry?.builder || entry?.company || entry?.companyName || entry?.name || 'Builder';
    const communityName = entry?.communityName || (entry?.name && entry.name !== companyName ? entry.name : '') || '';
    const fallbackKey = companyName || communityName || `builder-${idx}`;
    const entityId = String(entry?._id || entry?.id || entry?.competitionId || entry?.communityRef || entry?.communityId || fallbackKey || `builder-${idx}`).trim() || `builder-${idx}`;
    const providedColor = entry?.colorHex || entry?.color || entry?.themeColor || entry?.primaryColor;

    const chip = createColorChip({
      entityId,
      role: 'linked',
      companyName,
      communityName,
      providedColor,
      fallbackKey,
      swatchLabel: `Change color for ${companyName}`
    });

    linkedWrap.appendChild(chip);
  });
}

// ---------- main refresh ----------
async function refreshAll() {
  const id = dd.value;
  if (!id) {
    renderPrimaryCommunityChip('');
    renderLotCountsTable([], [], '');
    collapseLotCounts({ focusToggle: false });
    return;
  }
  renderPrimaryCommunityChip(id);

  destroyCharts();
  if (baseMonthEl) {
    baseMonthEl.innerHTML = '';
    baseMonthEl.disabled = true;
  }

  // 1) profile + linked chips
  const { profile } = await getJSON(`/api/my-community-competition/${id}`);
  const metaUpdate = {};
  if (profile?.communityName) metaUpdate.communityName = profile.communityName;
  else if (profile?.name) metaUpdate.communityName = profile.name;

  if (profile?.builderName) metaUpdate.builderName = profile.builderName;
  if (profile?.builder) {
    metaUpdate.builder = profile.builder;
    if (!metaUpdate.builderName) metaUpdate.builderName = profile.builder;
  }

  if (profile?.company) {
    if (typeof profile.company === 'string') {
      metaUpdate.company = profile.company;
    } else if (profile.company?.name) {
      metaUpdate.company = profile.company.name;
    }
  } else if (profile?.companyName) {
    metaUpdate.company = profile.companyName;
  }

  const profileColor = profile?.colorHex || profile?.color || profile?.themeColor || profile?.primaryColor;
  if (profileColor) metaUpdate.colorHex = profileColor;

  if (Object.keys(metaUpdate).length) {
    setCommunityMeta(id, metaUpdate);
  }
  const linkedList = Array.isArray(profile?.linkedCompetitions) ? profile.linkedCompetitions : [];
  renderPrimaryCommunityChip(id, profile);
  renderLinked(linkedList);

  // 2) build id list for multi-scatter
  const linkedIds = linkedList.map(c => c?._id || c?.id).filter(Boolean);
  const allIds = [...new Set([id, ...linkedIds].filter(Boolean))];

  const lotStatsPromise = fetchLotStatsForIds(allIds);

  // 3) scatter (multi)
  await drawQmiSoldsMulti(allIds);

  // 4) lot counts (multi)
  try {
    const lotStats = await lotStatsPromise;
    renderLotCountsTable(allIds, lotStats, id);
  } catch (err) {
    console.error('Lot counts load failed:', err);
    const errorResults = allIds
      .map(commId => {
        const normalized = normalizeId(commId);
        return normalized ? { id: normalized, error: true, stats: null } : null;
      })
      .filter(Boolean);
    renderLotCountsTable(allIds, errorResults, id);
  }

  // 5) pie + base price (single)
  const salesWindow = (salesWindowEl?.value) || '90d';
  await drawSalesTotalsPie(allIds, salesWindow);  // multi-community totals pie
  try {
    await drawBasePrice(id);
  } catch (err) {
    console.error('Base price load failed:', err);
  }
}
