// client/assets/js/my-community-competition/linked.js
import { currentCommunityId, linked, setLinked } from './state.js';
import { updateLinkedCompetitions, searchCompetitions } from './api.js';

export function renderLinked() {
  linkedContainer.innerHTML = '';
  linked.forEach(c => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex justify-content-between align-items-center';
    item.innerHTML = `<div><div><strong>${c.name}</strong></div><small>${c.builder || ''} ${c.market ? '— '+c.market : ''}</small></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn btn-sm btn-outline-danger';
    btn.textContent = 'Remove';
    btn.onclick = async () => {
      setLinked(linked.filter(x => x._id !== c._id));
      await saveLinked();
      renderLinked();
    };
    item.appendChild(btn);
    linkedContainer.appendChild(item);
  });
}

export async function saveLinked() {
  if (!currentCommunityId) return;
  await updateLinkedCompetitions(currentCommunityId, linked.map(x => x._id));
}

export function wireLinkedSearch() {
  compSearch?.addEventListener('input', async () => {
    const q = compSearch.value.trim();
    compResults.innerHTML = '';
    if (!q) return;
    const results = await searchCompetitions(q);
    results.forEach(r => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-group-item list-group-item-action';
      btn.textContent = `${r.name} — ${r.builder || ''} ${r.market ? '('+r.market+')' : ''}`;
      btn.onclick = async () => {
        if (!linked.find(x => x._id === r._id)) {
          setLinked([...linked, r]);
          await saveLinked();
          renderLinked();
        }
      };
      compResults.appendChild(btn);
    });
  });
}
