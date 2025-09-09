// client/assets/js/my-community-competition/index.js
import { currentCommunityId } from './state.js';
import { wireCommunitySelect, initialLoad } from './loader.js';
import { wireTabs } from './ui.js';
import { drawSalesGraph, drawBasePriceGraph, drawQmiSoldsGraph } from './charts.js';
import { setupSectionToggles } from './toggles.js';
import { wireLinkedSearch } from './linked.js';

async function fetchAllCompetitions() {
  const res = await fetch('/api/competitions/minimal');
  if (!res.ok) return [];
  return res.json(); // [{_id, communityName, builderName, city, state}]
}

function renderLinkedList() {
  linkedContainer.innerHTML = '';
  linked.forEach(c => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    item.innerHTML = `
      <div>
        <div><strong>${c.builderName}</strong> — ${c.communityName}</div>
        <small>${c.city}, ${c.state ?? 'TX'}</small>
      </div>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-danger';
    btn.textContent = 'Unlink';
    btn.onclick = async () => { await unlinkCompetition(c._id); };
    item.appendChild(btn);
    linkedContainer.appendChild(item);
  });
}

let allCompetitions = [];
function renderAllCompetitions() {
  allCompetitionsList.innerHTML = '';
  const linkedIds = new Set(linked.map(x => x._id));
  allCompetitions.forEach(c => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    item.innerHTML = `
      <div>
        <div><strong>${c.builderName}</strong> — ${c.communityName}</div>
        <small>${c.city}, ${c.state ?? 'TX'}</small>
      </div>`;
    const btn = document.createElement('button');
    btn.className = linkedIds.has(c._id) ? 'btn btn-sm btn-secondary' : 'btn btn-sm btn-outline-primary';
    btn.textContent = linkedIds.has(c._id) ? 'Linked' : 'Link';
    btn.disabled = linkedIds.has(c._id);
    btn.onclick = async () => { await linkCompetition(c._id); };
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
  // Normalized shape to match minimal list fields:
  linked = linkedCompetitions.map(c => ({
    _id: c._id, communityName: c.communityName, builderName: c.builderName, city: c.city, state: c.state
  }));
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
  linked = linkedCompetitions.map(c => ({
    _id: c._id, communityName: c.communityName, builderName: c.builderName, city: c.city, state: c.state
  }));
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
  initialLoad();
}

document.addEventListener('DOMContentLoaded', init);
