// modal.js
export function initFloorPlanModal(openBtn, modalEl, onSelect) {
  openBtn.addEventListener('click', () => modalEl.classList.add('open'));
  modalEl.addEventListener('click', e => {
    if (e.target.matches('.plan-option')) {
      onSelect(e.target.dataset.planId);
      modalEl.classList.remove('open');
    }
    if (e.target.matches('.close')) {
      modalEl.classList.remove('open');
    }
  });
}
