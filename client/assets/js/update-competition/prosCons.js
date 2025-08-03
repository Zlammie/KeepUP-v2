// public/assets/js/update-competition/prosCons.js
export function renderBadges(container, items) {
  container.innerHTML = items
    .map(t=>`<span class="badge">${t}<button class="remove">×</button></span>`)
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
  // gather existing badges:
  const existing = Array.from(listEl.querySelectorAll('.badge'))
    .map(b => b.textContent.slice(0, -1));
  saveFn([...existing, txt]); // merge into a fresh array
  inputEl.value = '';
});
  // remove existing
listEl.addEventListener('click', e => {
  if (!e.target.matches('.remove')) return;
  const txt = e.target.parentNode.textContent.slice(0, -1);
  saveFn(txt, true);         // or however you signal “remove”
});
}