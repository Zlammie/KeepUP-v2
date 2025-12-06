import { deleteCompetition } from './api.js';
import { showFlash } from './utils.js';

export function bindDeleteButtons(container, flash) {
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = btn.dataset.id;
      const row = btn.closest('tr');
      if (!confirm('Delete this competition? This cannot be undone.')) return;
      btn.disabled = true; btn.textContent = '…';
      try {
        await deleteCompetition(id);
        row?.remove();
        showFlash(flash, 'Competition deleted.', 'success');
        const tbody = container.querySelector('tbody');
        if (tbody && !tbody.children.length) {
          container.innerHTML = '<p>No competitions found.</p>';
        }
      } catch (err) {
        showFlash(flash, err.message, 'danger');
      } finally {
        if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = '✕'; }
      }
    });
  });
}

export function bindToggleDelete(toggleDeleteBtn) {
  toggleDeleteBtn?.addEventListener('click', () => {
    const table = document.getElementById('compsTable');
    if (!table) return;
    const showing = toggleDeleteBtn.dataset.show === '1';
    if (showing) {
      table.classList.remove('show-delete');
      toggleDeleteBtn.dataset.show = '0';
      toggleDeleteBtn.textContent = 'Show Delete';
      toggleDeleteBtn.classList.replace('btn-danger', 'btn-outline-danger');
    } else {
      table.classList.add('show-delete');
      toggleDeleteBtn.dataset.show = '1';
      toggleDeleteBtn.textContent = 'Hide Delete';
      toggleDeleteBtn.classList.replace('btn-outline-danger', 'btn-danger');
    }
  });
}
