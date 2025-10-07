// client/assets/js/my-community-competition/index.js
import { currentCommunityId } from './state.js';
import { wireCommunitySelect, initialLoad } from './loader.js';
import { wireTabs } from './ui.js';
import { drawSalesGraph, drawBasePriceGraph, drawQmiSoldsGraph } from './charts.js';
import { setupSectionToggles } from './toggles.js';

const allCompetitionsList = document.getElementById('allCompetitionsList');
const linkedContainer = document.getElementById('linkedCompetitors');
let linked = [];
let allCompetitions = [];

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
  const separators = [' - ', ' — ', ' – ', ' | ', ' / ', ' • '];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      const [left, right] = cleaned.split(sep).map((part) => cleanText(part));
      if (left || right) return { builder: left, community: right };
    }
  }
  return { builder: '', community: cleaned };
};

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
  const resolvedId = id ?? toId(fallback?._id ?? fallback?.id ?? fallback?.competitionId);

  if (!resolvedId && !builderName && !communityName) {
    return null;
  }

  return {
    _id: resolvedId,
    builderName,
    communityName,
    city,
    state
  };
}


async function fetchAllCompetitions() {
  const res = await fetch('/api/competitions/minimal');
  if (!res.ok) return [];
  return res.json(); // [{_id, communityName, builderName, city, state}]
}

function renderLinkedList() {
  linkedContainer.innerHTML = '';
  linked.forEach((raw) => {
    const c = normalizeCompetition(raw);
    if (!c) return;
    const { _id } = c;
    if (!_id) return;
    const builderDisplay = cleanText(c.builderName) || 'Unknown builder';
    const communityDisplay = cleanText(c.communityName) || 'Unknown competition';
    const cityDisplay = cleanText(c.city) || 'City not set';
    const stateDisplay = cleanText(c.state) || 'TX';
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    item.innerHTML = `
      <div>
        <div><strong>${builderDisplay}</strong> - ${communityDisplay}</div>
        <small>${cityDisplay}, ${stateDisplay}</small>
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
  allCompetitionsList.innerHTML = '';
  const linkedIds = new Set(
    linked
      .map((entry) => normalizeCompetition(entry)?._id)
      .filter(Boolean)
  );
  allCompetitions.forEach((raw) => {
    const c = normalizeCompetition(raw);
    if (!c) return;
    const { _id } = c;
    if (!_id) return;
    const builderDisplay = cleanText(c.builderName) || 'Unknown builder';
    const communityDisplay = cleanText(c.communityName) || 'Unknown competition';
    const cityDisplay = cleanText(c.city) || 'City not set';
    const stateDisplay = cleanText(c.state) || 'TX';

    const item = document.createElement('div');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    item.innerHTML = `
      <div>
        <div><strong>${builderDisplay}</strong> - ${communityDisplay}</div>
        <small>${cityDisplay}, ${stateDisplay}</small>
      </div>`;
    const btn = document.createElement('button');
    const isLinked = linkedIds.has(_id);
    btn.className = isLinked ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-outline-primary';
    btn.textContent = isLinked ? 'Linked' : 'Link';
    btn.disabled = isLinked;
    btn.onclick = async () => { await linkCompetition(_id); };
    item.appendChild(btn);
    allCompetitionsList.appendChild(item);
  });
}

async function linkCompetition(competitionId) {
  if (!currentCommunityId) return;
  const res = await fetch(`/api/community-competition-profiles/${currentCommunityId}/linked-competitions/${competitionId}`, {
    method: 'POST'
  });
  if (!res.ok) return;
  const { linkedCompetitions } = await res.json();
  // Normalize response for consistent display:
  linked = linkedCompetitions.map((c) => normalizeCompetition(c)).filter(Boolean);
  renderLinkedList();
  renderAllCompetitions();
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
}

function init() {
  setupSectionToggles();
  wireCommunitySelect();
  wireTabs(
    {
      sales: drawSalesGraph,
      base:  drawBasePriceGraph,
      qmi:   drawQmiSoldsGraph,
      sqft:  async () => { /* placeholder: coming soon */ }
    },
    () => currentCommunityId
  );
  fetchAllCompetitions().then(data => {
    const normalizedAll = (data || []).map((c) => normalizeCompetition(c, data)).filter(Boolean);
    allCompetitions = normalizedAll;
    linked = linked.map((entry) => normalizeCompetition(entry)).filter(Boolean);
    renderAllCompetitions();
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
  
});

document.addEventListener('DOMContentLoaded', init);

