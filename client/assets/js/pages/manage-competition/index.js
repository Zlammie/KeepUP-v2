import { listCompetitions, listMyCommunities } from './api.js';
import {
  renderFilterBar,
  renderTable
} from './render.js';
import { bindDeleteButtons, bindToggleDelete } from './events.js';
import { els } from './state.js';
import { showFlash } from './utils.js';

let allCompetitions = [];
let selectedCommunityId = '';
let linkedCommunityOptions = [];

function applyDeleteToggleState() {
  const table = document.getElementById('compsTable');
  if (!table) return;

  if (els.toggleDeleteBtn?.dataset.show === '1') {
    table.classList.add('show-delete');
    els.toggleDeleteBtn.textContent = 'Hide Delete';
    els.toggleDeleteBtn.classList.replace('btn-outline-danger', 'btn-danger');
  }
}

function renderPage() {
  const filterOptions = linkedCommunityOptions;
  if (selectedCommunityId && !filterOptions.some((option) => option.id === selectedCommunityId)) {
    selectedCommunityId = '';
  }

  if (els.filterBar) {
    els.filterBar.innerHTML = renderFilterBar(filterOptions, selectedCommunityId);
    const filterSelect = document.getElementById('communityFilter');
    filterSelect?.addEventListener('change', async (event) => {
      selectedCommunityId = event.target.value || '';
      await loadTable();
    });
  }

  els.container.innerHTML = renderTable(allCompetitions);
  applyDeleteToggleState();
  bindDeleteButtons(els.container, els.flash, (deletedId) => {
    allCompetitions = allCompetitions.filter((competition) => String(competition?._id) !== String(deletedId));
    renderPage();
  });
}

async function loadTable() {
  try {
    const requests = [listCompetitions(selectedCommunityId)];
    if (!linkedCommunityOptions.length) requests.push(listMyCommunities());

    const [payload, communities] = await Promise.all(requests);
    allCompetitions = Array.isArray(payload?.items) ? payload.items : [];
    if (Array.isArray(communities)) {
      linkedCommunityOptions = communities;
    }
    renderPage();
  } catch (err) {
    els.container.innerHTML = '<p class="text-danger">Error loading competitions.</p>';
    showFlash(els.flash, err.message, 'danger');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindToggleDelete(els.toggleDeleteBtn);
  loadTable();
});
