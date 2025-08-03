// public/assets/js/update-competition/modal.js




/**
 * Wire your “Add / Update Floor Plans” trigger to open/close the Bootstrap modal.
 * @param {HTMLElement} openBtn    the button that calls the modal
 * @param {HTMLElement} modalEl    the <div id="floorPlanModal">
 * @param {(planId:string)=>void} onSelect callback when a plan-option is clicked
 */
export function initFloorPlanModal(openBtn, modalEl, onSelect) {
  const bsModal = new bootstrap.Modal(modalEl);

  // show the modal
  openBtn.addEventListener('click', () => bsModal.show());

  // delegate clicks on plan items & close button
  modalEl.addEventListener('click', e => {
    if (e.target.matches('.plan-option')) {
      onSelect(e.target.dataset.planId);
      bsModal.hide();
    }
    if (e.target.matches('[data-bs-dismiss="modal"], .btn-close')) {
      bsModal.hide();
    }
  });
 }
