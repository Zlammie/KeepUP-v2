// /assets/js/realtors/modal.js
import { postRealtorComment } from './api.js';

let currentRealtorId = null;

export function initRealtorModal() {
  const modal = document.getElementById('realtorCommentModal');
  const saveBtn = document.getElementById('saveRealtorModalComment');
  const cancelBtn = document.getElementById('cancelRealtorModalComment');
  const typeBtns = document.querySelectorAll('#realtor-modal-comment-type-buttons button');

  // type toggle
  typeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      typeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // save → POST
  saveBtn.addEventListener('click', async () => {
    const content = document.getElementById('realtor-modal-comment-text').value.trim();
    const typeBtn = document.querySelector('#realtor-modal-comment-type-buttons button.active');
    const type = typeBtn ? typeBtn.getAttribute('data-type') : 'Note';
    if (!content || !currentRealtorId) return;

    await postRealtorComment({ type, content, realtorId: currentRealtorId });
    closeRealtorCommentModal();
  });

  // cancel & close behaviors
  cancelBtn?.addEventListener('click', () => closeRealtorCommentModal());
  modal.addEventListener('click', (e) => { if (e.target === modal) closeRealtorCommentModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') closeRealtorCommentModal();
  });
}

export function openRealtorCommentModal(realtorId) {
  currentRealtorId = realtorId;
  document.getElementById('realtor-modal-comment-text').value = '';
  document.getElementById('realtorCommentModal').style.display = 'flex';

  // reset type to Note
  document.querySelectorAll('#realtor-modal-comment-type-buttons button').forEach((b) => b.classList.remove('active'));
  document.querySelector('#realtor-modal-comment-type-buttons button[data-type="Note"]')?.classList.add('active');
}

export function closeRealtorCommentModal() {
  document.getElementById('realtorCommentModal').style.display = 'none';
  currentRealtorId = null;
}

