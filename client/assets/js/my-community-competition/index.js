// client/assets/js/my-community-competition/index.js
import { currentCommunityId, sqftMonth, setSqftMonth } from './state.js';
import {
  builderTitle,
  allCompetitionsList,
  linkedContainer,
  availableListCount,
  linkedCompetitorsCount,
  linkedCountBadge,
  allCompetitionsEmpty,
  linkedCompetitorsEmpty,
  allCompetitionsSearch,
  internalCommunitiesList,
  internalCommunitiesEmpty,
  competitorModeToggle,
  overviewSections,
  overviewCollapseToggle,
  overviewCollapsedBar,
  overviewExpandBtn
} from './dom.js';
import { wireCommunitySelect, initialLoad } from './loader.js';
import { wireTabs } from './ui.js';
import { drawSalesGraph, drawBasePriceGraph, drawQmiSoldsGraph, drawSqftComparisonGraph } from './charts.js';
import { setupSectionToggles } from './toggles.js';
import { qmiSoldTable } from './qmiSoldTable.js';
import { initAmenities } from './amenities.js';
import { initTaskPanel } from '../contact-details/tasks.js';

let linked = [];
let allCompetitions = [];
let internalCommunities = [];
let latestQmiData = null;
let qmiTablesInstance = null;

const qmiTableCardWrap = document.getElementById('qmiTableCardWrap');
const qmiTableCard = document.getElementById('qmiTableCard');
const qmiTableToggle = document.getElementById('qmiTableToggle');
const communitySelectEl = document.getElementById('communitySelect');
const sqftMonthSelect = document.getElementById('sqftMonthSelect');
const builderTitleEl = builderTitle;

let qmiTableOverlay = null;
let qmiTableExpanded = false;
let qmiTableEscListener = null;
let listMode = 'external';
let listSearchTerm = '';
let taskPanelController = null;

const OVERVIEW_COLLAPSE_KEY = 'mcc:overviewCollapsed';

function setOverviewCollapsed(collapsed) {
  const hidden = Boolean(collapsed);
  overviewSections?.classList.toggle('is-hidden', hidden);

  if (overviewCollapseToggle) {
    overviewCollapseToggle.textContent = hidden ? 'Show Promo & Pros' : 'Hide Promo & Pros';
    overviewCollapseToggle.setAttribute('aria-expanded', String(!hidden));
    overviewCollapseToggle.setAttribute('aria-controls', 'overviewSections');
    overviewCollapseToggle.classList.toggle('is-hidden', hidden);
  }

  overviewCollapsedBar?.classList.toggle('is-hidden', !hidden);

  try {
    localStorage.setItem(OVERVIEW_COLLAPSE_KEY, hidden ? 'hidden' : 'shown');
  } catch (_) {}
}

function initOverviewCollapse() {
  if (!overviewCollapseToggle || !overviewSections) return;

  let saved = null;
  try { saved = localStorage.getItem(OVERVIEW_COLLAPSE_KEY); } catch (_) {}
  setOverviewCollapsed(saved === 'hidden');

  overviewCollapseToggle.addEventListener('click', () => {
    const isCurrentlyHidden = overviewSections.classList.contains('is-hidden');
    setOverviewCollapsed(!isCurrentlyHidden);
  });

  overviewExpandBtn?.addEventListener('click', () => setOverviewCollapsed(false));
}

const toId = (value) => (value == null ? null : String(value));
const cleanText = (value) => {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  const lowered = text.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null' || lowered === 'n/a') return '';
  return text;
};
const pickField = (...values) => {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return '';
};
const splitLabel = (label) => {
  const cleaned = cleanText(label);
  if (!cleaned) return { builder: '', community: '' };
  const separators = [' - ', ' | ', ' / '];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      const [left, right] = cleaned.split(sep).map((part) => cleanText(part));
      if (left || right) return { builder: left, community: right };
    }
  }
  return { builder: '', community: cleaned };
};

function ensureQmiTableOverlay() {
  if (qmiTableOverlay && qmiTableOverlay.isConnected) {
    return qmiTableOverlay;
  }
  const overlay = document.createElement('div');
  overlay.id = 'qmiTableOverlay';
  overlay.className = 'expandable-table-overlay';
  overlay.addEventListener('click', () => collapseQmiTable());
  qmiTableOverlay = overlay;
  return overlay;
}

function expandQmiTable() {
  if (!qmiTableCard || qmiTableExpanded) return;

  const placeholderHeight = qmiTableCardWrap?.offsetHeight || qmiTableCard.offsetHeight || 0;
  if (qmiTableCardWrap) {
    qmiTableCardWrap.style.minHeight = `${placeholderHeight}px`;
  }

  const overlay = ensureQmiTableOverlay();
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  qmiTableCard.classList.add('is-expanded');
  document.body.classList.add('expandable-table-expanded');

  if (qmiTableToggle) {
    qmiTableToggle.setAttribute('aria-expanded', 'true');
    qmiTableToggle.setAttribute('aria-label', 'Collapse quick move-in table');
    const sr = qmiTableToggle.querySelector('.visually-hidden');
    if (sr) sr.textContent = 'Collapse quick move-in table';
    const icon = qmiTableToggle.querySelector('.expandable-table-toggle-icon');
    if (icon) icon.textContent = '[x]';
  }

  qmiTableExpanded = true;
  qmiTableEscListener = (event) => {
    if (event.key === 'Escape') {
      collapseQmiTable();
    }
  };
  document.addEventListener('keydown', qmiTableEscListener);
}

function collapseQmiTable(options = {}) {
  if (!qmiTableCard || !qmiTableExpanded) return;

  qmiTableExpanded = false;
  qmiTableCard.classList.remove('is-expanded');

  if (qmiTableCardWrap) {
    qmiTableCardWrap.style.minHeight = '';
  }

  if (!document.querySelector('.expandable-table-card.is-expanded')) {
    document.body.classList.remove('expandable-table-expanded');
  }

  if (qmiTableToggle) {
    qmiTableToggle.setAttribute('aria-expanded', 'false');
    qmiTableToggle.setAttribute('aria-label', 'Expand quick move-in table');
    const sr = qmiTableToggle.querySelector('.visually-hidden');
    if (sr) sr.textContent = 'Expand quick move-in table';
    const icon = qmiTableToggle.querySelector('.expandable-table-toggle-icon');
    if (icon) icon.textContent = '[+]';
    if (options.focusToggle !== false) {
      qmiTableToggle.focus();
    }
  }

  const overlay = qmiTableOverlay;
  qmiTableOverlay = null;
  if (overlay && overlay.parentNode) {
    overlay.parentNode.removeChild(overlay);
  }

  if (qmiTableEscListener) {
    document.removeEventListener('keydown', qmiTableEscListener);
    qmiTableEscListener = null;
  }
}

const buildCommunityTaskTitle = () => {
  const rawLabel = builderTitleEl?.textContent?.trim();
  const label = rawLabel && rawLabel !== '�?"' ? rawLabel : '';
  if (label) return `Follow up on ${label}`;
  const selectedOption = communitySelectEl?.selectedOptions?.[0];
  const optionLabel = selectedOption?.textContent?.trim();
  return optionLabel ? `Follow up on ${optionLabel}` : 'Follow up on this community';
};

function toggleQmiTable() {
  if (qmiTableExpanded) {
    collapseQmiTable();
  } else {
    expandQmiTable();
  }
}

if (qmiTableToggle && qmiTableCard) {
  qmiTableToggle.addEventListener('click', toggleQmiTable);
}

if (communitySelectEl) {
  communitySelectEl.addEventListener('change', () => collapseQmiTable({ focusToggle: false }));
}

function normalizeCompetition(raw, fallbackList = allCompetitions) {
  if (!raw) return null;

  let entry = raw;
  if (entry.competition) {
    entry = entry.competition;
  }
  if (typeof entry === 'string') {
    entry = { _id: entry };
  }

  const id = toId(entry._id ?? entry.id ?? entry.competitionId);
  const list = Array.isArray(fallbackList) ? fallbackList : [];
  const fallback = list.find((item) => {
    const itemId = toId(item?._id ?? item?.id ?? item?.competitionId);
    return itemId && id && itemId === id;
  });
  const labelInfo = splitLabel(pickField(entry.label, entry.text, fallback?.label, fallback?.text));

  const builderName = pickField(
    entry.builderName,
    entry.title,
    entry.displayName,
    entry.builder?.name,
    entry.builder?.builderName,
    entry.builder,
    fallback?.builderName,
    fallback?.title,
    fallback?.displayName,
    fallback?.builder?.name,
    fallback?.builder?.builderName,
    fallback?.builder,
    labelInfo.builder
  );
  const communityName = pickField(
    entry.communityName,
    entry.communityTitle,
    entry.communityLabel,
    entry.community?.name,
    entry.community?.communityName,
    entry.name,
    fallback?.communityTitle,
    fallback?.communityLabel,
    fallback?.communityName,
    fallback?.community?.name,
    fallback?.community?.communityName,
    fallback?.name,
    labelInfo.community
  );
  const market = pickField(
    entry.market,
    entry.community?.market,
    fallback?.market,
    fallback?.community?.market
  );
  const city = pickField(
    entry.city,
    entry.location?.city,
    entry.community?.city,
    fallback?.city,
    fallback?.location?.city,
    fallback?.community?.city
  );
  const state = pickField(
    entry.state,
    entry.location?.state,
    entry.community?.state,
    fallback?.state,
    fallback?.location?.state,
    fallback?.community?.state,
    'TX'
  ) || 'TX';
  const communityRef = toId(
    entry.communityRef ??
    entry.community?.communityRef ??
    entry.community?.id ??
    fallback?.communityRef ??
    fallback?.community?.communityRef ??
    fallback?.community?.id
  );
  const isInternal = Boolean(
    entry.isInternal ??
    fallback?.isInternal ??
    (communityRef ? true : false)
  );
  const resolvedId = id ?? toId(fallback?._id ?? fallback?.id ?? fallback?.competitionId);

  if (!resolvedId && !builderName && !communityName) {
    return null;
  }

  return {
    _id: resolvedId,
    builderName,
    communityName,
    market,
    city,
    state,
    communityRef,
    isInternal
  };
}

function normalizeCommunity(raw) {
  if (!raw) return null;
  const id = toId(raw._id ?? raw.id);
  if (!id) return null;
  return {
    _id: id,
    name: cleanText(raw.name) || 'Unnamed community',
    city: cleanText(raw.city),
    state: cleanText(raw.state) || 'TX',
    market: cleanText(raw.market)
  };
}


async function fetchAllCompetitions() {
  const res = await fetch('/api/competitions/minimal');
  if (!res.ok) return [];
  return res.json(); // [{_id, communityName, builderName, city, state}]
}

async function fetchInternalCommunities() {
  const res = await fetch('/api/communities');
  if (!res.ok) return [];
  return res.json();
}

function renderLinkedList() {
  linkedContainer.innerHTML = '';

  const items = linked
    .map((raw) => normalizeCompetition(raw))
    .filter(Boolean)
    .sort((a, b) => (cleanText(a.builderName) || '').localeCompare(cleanText(b.builderName) || '') ||
      (cleanText(a.communityName) || '').localeCompare(cleanText(b.communityName) || ''));

  const linkedCount = items.length;
  if (linkedCompetitorsCount) linkedCompetitorsCount.textContent = `${linkedCount} linked`;
  if (linkedCountBadge) linkedCountBadge.textContent = `${linkedCount} linked`;

  if (linkedCompetitorsEmpty) {
    linkedCompetitorsEmpty.classList.toggle('is-hidden', linkedCount > 0);
  }

  items.forEach((c) => {
    const { _id } = c;
    if (!_id) return;
    const builderDisplay = cleanText(c.builderName) || 'Unknown builder';
    const communityDisplay = cleanText(c.communityName) || 'Unnamed community';
    const cityDisplay = cleanText(c.city) || 'City not set';
    const stateDisplay = cleanText(c.state) || 'TX';
    const marketDisplay = cleanText(c.market);
    const badgeHtml = c.isInternal ? '<span class="internal-badge">My Company</span>' : '';
    const metaLine = `${cityDisplay}, ${stateDisplay}${marketDisplay ? ` • ${marketDisplay}` : ''}`;

    const item = document.createElement('div');
    item.className = 'list-group-item';
    item.innerHTML = `
      <div>
        <div class="list-item-title"><strong>${builderDisplay}</strong> - ${communityDisplay} ${badgeHtml}</div>
        <small>${metaLine}</small>
      </div>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-danger';
    btn.textContent = 'Unlink';
    btn.onclick = async () => { await unlinkCompetition(_id); };
    item.appendChild(btn);
    linkedContainer.appendChild(item);
  });
}

function renderAllCompetitions() {
  const isActive = listMode === 'external';

  if (allCompetitionsList) {
    allCompetitionsList.classList.toggle('is-hidden', !isActive);
  }
  if (allCompetitionsEmpty) {
    allCompetitionsEmpty.classList.toggle('is-hidden', !isActive);
  }

  if (!isActive) return;

  allCompetitionsList.innerHTML = '';

  const linkedIds = new Set(
    linked
      .map((entry) => normalizeCompetition(entry))
      .filter((comp) => comp && comp._id)
      .map((comp) => comp._id)
  );

  const filtered = allCompetitions
    .map((raw) => normalizeCompetition(raw))
    .filter((c) => c && c._id && !c.isInternal && !linkedIds.has(c._id))
    .filter((c) => {
      if (!listSearchTerm) return true;
      const needle = listSearchTerm;
      return [
        cleanText(c.builderName),
        cleanText(c.communityName),
        cleanText(c.market),
        cleanText(c.city),
        cleanText(c.state)
      ].some((val) => val && val.toLowerCase().includes(needle));
    })
    .sort((a, b) => (cleanText(a.builderName) || '').localeCompare(cleanText(b.builderName) || '') ||
      (cleanText(a.communityName) || '').localeCompare(cleanText(b.communityName) || ''));

  if (availableListCount) {
    const label = filtered.length === 1 ? 'builder' : 'builders';
    availableListCount.textContent = `${filtered.length} ${label}`;
  }

  if (allCompetitionsEmpty) {
    allCompetitionsEmpty.classList.toggle('is-hidden', filtered.length > 0);
  }

  filtered.forEach((c) => {
    const { _id } = c;
    const builderDisplay = cleanText(c.builderName) || 'Unknown builder';
    const communityDisplay = cleanText(c.communityName) || 'Unnamed community';
    const cityDisplay = cleanText(c.city) || 'City not set';
    const stateDisplay = cleanText(c.state) || 'TX';
    const marketDisplay = cleanText(c.market);

    const item = document.createElement('div');
    item.className = 'list-group-item';
    item.innerHTML = `
      <div>
        <div><strong>${builderDisplay}</strong> - ${communityDisplay}</div>
        <small>${cityDisplay}, ${stateDisplay}${marketDisplay ? ` • ${marketDisplay}` : ''}</small>
      </div>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-primary';
    btn.textContent = 'Link';
    btn.onclick = async () => { await linkCompetition(_id); };
    item.appendChild(btn);
    allCompetitionsList.appendChild(item);
  });
}

function renderInternalCommunities() {
  if (!internalCommunitiesList || !internalCommunitiesEmpty) return;

  const isActive = listMode === 'internal';
  internalCommunitiesList.classList.toggle('is-hidden', !isActive);
  internalCommunitiesEmpty.classList.toggle('is-hidden', !isActive);

  if (!isActive) return;

  internalCommunitiesList.innerHTML = '';

  const linkedCommunityRefs = new Set(
    linked
      .map((entry) => normalizeCompetition(entry))
      .filter((comp) => comp && comp.communityRef)
      .map((comp) => comp.communityRef)
  );

  const filtered = internalCommunities
    .filter((c) => c && c._id && c._id !== currentCommunityId)
    .filter((c) => !linkedCommunityRefs.has(c._id))
    .filter((c) => {
      if (!listSearchTerm) return true;
      const needle = listSearchTerm;
      return [
        cleanText(c.name),
        cleanText(c.market),
        cleanText(c.city),
        cleanText(c.state)
      ].some((val) => val && val.toLowerCase().includes(needle));
    })
    .sort((a, b) => (cleanText(a.name) || '').localeCompare(cleanText(b.name) || ''));

  if (availableListCount) {
    const label = filtered.length === 1 ? 'community' : 'communities';
    availableListCount.textContent = `${filtered.length} ${label}`;
  }

  internalCommunitiesEmpty.classList.toggle('is-hidden', filtered.length > 0);

  filtered.forEach((c) => {
    const { _id } = c;
    const nameDisplay = cleanText(c.name) || 'Unnamed community';
    const cityDisplay = cleanText(c.city) || 'City not set';
    const stateDisplay = cleanText(c.state) || 'TX';
    const marketDisplay = cleanText(c.market);

    const item = document.createElement('div');
    item.className = 'list-group-item';
    item.innerHTML = `
      <div>
        <div><strong>${nameDisplay}</strong>${marketDisplay ? ` <span class="item-subtle">(${marketDisplay})</span>` : ''}</div>
        <small>${cityDisplay}, ${stateDisplay}</small>
      </div>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-primary';
    btn.textContent = 'Link';
    btn.onclick = async () => { await linkInternalCommunity(_id); };
    item.appendChild(btn);
    internalCommunitiesList.appendChild(item);
  });
}

function setListMode(mode, force = false) {
  if (mode !== 'external' && mode !== 'internal') return;
  if (!force && listMode === mode) return;
  listMode = mode;

  if (competitorModeToggle) {
    competitorModeToggle.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === listMode);
    });
  }

  if (allCompetitionsSearch) {
    allCompetitionsSearch.placeholder = listMode === 'external'
      ? 'Search by builder or community'
      : 'Search communities';
  }

  renderAllCompetitions();
  renderInternalCommunities();
}

async function linkInternalCommunity(communityId) {
  if (!currentCommunityId || !communityId) return;
  const res = await fetch(`/api/competitions/internal/from-community/${communityId}`, {
    method: 'POST'
  });
  if (!res.ok) return;
  const payload = await res.json().catch(() => null);
  const competition = payload?.competition;
  const competitionId = toId(competition?._id);
  if (!competitionId) return;
  const normalizedInternal = normalizeCompetition(competition, allCompetitions);
  if (normalizedInternal) {
    const exists = allCompetitions.some((item) => toId(item?._id) === normalizedInternal._id);
    if (!exists) allCompetitions.push(normalizedInternal);
  }
  await linkCompetition(competitionId);
}

async function linkCompetition(competitionId) {
  if (!currentCommunityId) {
    window.alert('Select a community before linking competitors.');
    return;
  }
  const res = await fetch(`/api/community-competition-profiles/${currentCommunityId}/linked-competitions/${competitionId}`, {
    method: 'POST'
  });
  if (!res.ok) return;
  const { linkedCompetitions } = await res.json();
  // Normalize response for consistent display:
  linked = linkedCompetitions.map((c) => normalizeCompetition(c)).filter(Boolean);
  renderLinkedList();
  renderAllCompetitions();
  renderInternalCommunities();
}

async function unlinkCompetition(competitionId) {
  if (!currentCommunityId) return;
  const res = await fetch(`/api/community-competition-profiles/${currentCommunityId}/linked-competitions/${competitionId}`, {
    method: 'DELETE'
  });
  if (!res.ok) return;
  const { linkedCompetitions } = await res.json();
  linked = linkedCompetitions.map((c) => normalizeCompetition(c)).filter(Boolean);
  renderLinkedList();
  renderAllCompetitions();
  renderInternalCommunities();
}

function init() {
  setupSectionToggles();
  initOverviewCollapse();
  initAmenities();
  wireCommunitySelect();
  collapseQmiTable({ focusToggle: false });

  qmiTablesInstance = qmiSoldTable({
    onData: ({ communityId, data }) => {
      if (communityId !== currentCommunityId) return;
      latestQmiData = data || null;
      const activeTab = document.querySelector('.tab-btn.is-active');
      if (communityId === currentCommunityId && activeTab?.dataset.tab === 'qmi') {
        drawQmiSoldsGraph(communityId, { data: latestQmiData }).catch(console.error);
      }
    }
  });

  wireTabs(
    {
      sales: drawSalesGraph,
      base:  drawBasePriceGraph,
      qmi:   async (id) => {
        if (latestQmiData && id === currentCommunityId) {
          await drawQmiSoldsGraph(id, { data: latestQmiData });
          return;
        }
        const payload = await drawQmiSoldsGraph(id);
        if (payload && id === currentCommunityId) {
          latestQmiData = payload;
        }
      },
      sqft:  async (id) => {
        const result = await drawSqftComparisonGraph(id, { month: sqftMonth || undefined });
        if (result && id === currentCommunityId) {
          setSqftMonth(result.selectedMonth ?? '');
        }
      }
    },
    () => currentCommunityId
  );

  if (sqftMonthSelect) {
    sqftMonthSelect.addEventListener('change', async (event) => {
      const id = currentCommunityId;
      if (!id) return;
      const month = event.target.value || '';
      if ((sqftMonth || '') === month) return;
      setSqftMonth(month);
      try {
        const result = await drawSqftComparisonGraph(id, { month: month || undefined });
        if (result && id === currentCommunityId) {
          setSqftMonth(result.selectedMonth ?? month ?? '');
        }
      } catch (err) {
        console.error('Failed to update sqft comparison', err);
      }
    });
  }

  if (allCompetitionsSearch) {
    allCompetitionsSearch.addEventListener('input', (event) => {
      listSearchTerm = (event.target.value || '').trim().toLowerCase();
      renderAllCompetitions();
      renderInternalCommunities();
    });
  }

  if (competitorModeToggle) {
    competitorModeToggle.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setListMode(btn.dataset.mode));
    });
  }

  taskPanelController = initTaskPanel({
    linkedModel: 'Community',
    linkedId: currentCommunityId,
    defaultTitleBuilder: buildCommunityTaskTitle,
    defaultAssignmentTarget: 'contact'
  });

  communitySelectEl?.addEventListener('change', () => {
    if (!communitySelectEl.value || communitySelectEl.value === 'undefined') {
      taskPanelController?.setContext({ linkedId: null, assignmentTarget: 'contact' });
    }
  });

  setListMode(listMode, true);

  Promise.allSettled([fetchAllCompetitions(), fetchInternalCommunities()])
    .then(([competitionsResult, communitiesResult]) => {
      const competitionsRaw = competitionsResult.status === 'fulfilled' ? competitionsResult.value : [];
      const communitiesRaw = communitiesResult.status === 'fulfilled' ? communitiesResult.value : [];

      if (competitionsResult.status === 'rejected') {
        console.error('Failed to load competitions', competitionsResult.reason);
      }
      if (communitiesResult.status === 'rejected') {
        console.error('Failed to load communities', communitiesResult.reason);
      }

      const normalizedAll = (competitionsRaw || [])
        .map((c) => normalizeCompetition(c, competitionsRaw))
        .filter(Boolean);
      const dedupedAll = [];
      const seenComp = new Set();
      normalizedAll.forEach((comp) => {
        const compId = toId(comp?._id);
        if (!compId || seenComp.has(compId)) return;
        seenComp.add(compId);
        dedupedAll.push(comp);
      });
      const normalizedCommunities = (communitiesRaw || [])
        .map((c) => normalizeCommunity(c))
        .filter(Boolean);

      allCompetitions = dedupedAll;
      internalCommunities = normalizedCommunities;
      linked = linked.map((entry) => normalizeCompetition(entry)).filter(Boolean);

      renderAllCompetitions();
      renderInternalCommunities();
      renderLinkedList();
    });
  initialLoad();
}

window.addEventListener('mcc:profileLoaded', (e) => {
  const arr = e.detail?.profile?.linkedCompetitions || [];
  // Normalize for consistent display
  linked = arr.map((c) => normalizeCompetition(c)).filter(Boolean);
  renderLinkedList();
  renderAllCompetitions(); // re-mark already linked items
  renderInternalCommunities();
  collapseQmiTable({ focusToggle: false });
  if (qmiTablesInstance) {
    latestQmiData = null;
    qmiTablesInstance.load(currentCommunityId).catch(console.error);
  }

  const selectedId = e.detail?.communityId || currentCommunityId;
  taskPanelController?.setContext({
    linkedModel: 'Community',
    linkedId: selectedId,
    defaultTitleBuilder: buildCommunityTaskTitle,
    assignmentTarget: 'contact'
  });
});

document.addEventListener('DOMContentLoaded', init);

