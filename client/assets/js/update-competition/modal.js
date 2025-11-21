// public/assets/js/update-competition/modal.js




/**
 * Wire your “Add / Update Floor Plans” trigger to open/close the Bootstrap modal.
 * @param {HTMLElement} openBtn    the button that calls the modal
 * @param {HTMLElement} modalEl    the <div id="floorPlanModal">
 * @param {(planId:string)=>void} onSelect callback when a plan-option is clicked
 */
export function initFloorPlanModal(openBtn, modalEl, onSelect = null) {
  if (!openBtn || !modalEl) return;
  const bsModal = new bootstrap.Modal(modalEl);

  openBtn.addEventListener('click', () => bsModal.show());

  modalEl.addEventListener('click', (e) => {
    const planOption = e.target.closest('.plan-option');
    if (planOption) {
      e.preventDefault();
      const shouldClose = typeof onSelect === 'function' ? onSelect(planOption.dataset.planId) : undefined;
      if (shouldClose !== false) {
        bsModal.hide();
      }
      return;
    }

    if (e.target.matches('[data-bs-dismiss="modal"], .btn-close')) {
      bsModal.hide();
    }
  });
}
