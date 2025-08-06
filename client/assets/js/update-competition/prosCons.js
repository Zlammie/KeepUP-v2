// public/assets/js/update-competition/prosCons.js

/**
 * Render pros or cons as Bootstrap badges.
 *
 * @param {HTMLElement} container  where to put them (#prosList or #consList)
 * @param {string[]}   items      array of texts
 */
export function renderBadges(container, items) {
  // decide color based on the container’s id
  const isPros = container.id === 'prosList';
  const badgeClass = isPros ? 'badge bg-success me-1' : 'badge bg-danger me-1';

  container.innerHTML = items
    .map(text =>
      `<span class="${badgeClass}">${text}<button type="button" class="btn-close btn-close-white btn-sm ms-1" aria-label="Remove"></button></span>`
    )
    .join('');
}


/**
 * Wire up “Add” and “Remove” behavior for a pros/cons list.
 * 
 * @param {HTMLElement} addBtn    The “Add” button element
 * @param {HTMLInputElement} inputEl  The text input for new items
 * @param {HTMLElement} listEl   The container where badges live
 * @param {function(string, boolean=):void} saveFn  Called with (text, isRemove)
 */
export function bindProsCons(addBtn, inputEl, listEl, saveFn) {
  addBtn.addEventListener('click', () => {
    const txt = inputEl.value.trim();
    if (!txt) return;
    const existing = Array.from(listEl.querySelectorAll('.badge'))
      .map(b => b.textContent.slice(0, -1));
    // correctly spread into a new array:
    saveFn([...existing, txt]);
    inputEl.value = '';
  });

  listEl.addEventListener('click', e => {
    if (!e.target.matches('.btn-close')) return;
    const txt = e.target.parentNode.textContent.slice(0, -1);
    // filter it out and save:
    const existing = Array.from(listEl.querySelectorAll('.badge'))
      .map(b => b.textContent.slice(0, -1));
    saveFn(existing.filter(item => item !== txt));
  });
}