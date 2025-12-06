import { listCompetitions } from './api.js';
import { renderTable } from './render.js';
import { bindDeleteButtons, bindToggleDelete } from './events.js';
import { els } from './state.js';
import { showFlash } from './utils.js';

async function loadTable() {
  try {
    const comps = await listCompetitions();
    els.container.innerHTML = renderTable(comps);

    // preserve toggle state after reload
    const table = document.getElementById('compsTable');
    if (els.toggleDeleteBtn?.dataset.show === '1') {
      table.classList.add('show-delete');
      els.toggleDeleteBtn.textContent = 'Hide Delete';
      els.toggleDeleteBtn.classList.replace('btn-outline-danger', 'btn-danger');
    }

    bindDeleteButtons(els.container, els.flash);
  } catch (err) {
    els.container.innerHTML = '<p class="text-danger">Error loading competitions.</p>';
    showFlash(els.flash, err.message, 'danger');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindToggleDelete(els.toggleDeleteBtn);
  loadTable();
});
