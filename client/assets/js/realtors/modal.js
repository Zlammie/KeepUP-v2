// /assets/js/realtors/modal.js
import { postRealtorComment } from './api.js';

let currentRealtorId = null;

export function initRealtorModal() {
const modal = document.getElementById('commentModal');
const saveBtn = document.getElementById('saveModalComment');
const cancelBtn = document.getElementById('cancelModalComment');
const typeBtns = document.querySelectorAll('#modal-comment-type-buttons button');

  // type toggle
  typeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      typeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // save → POST
  saveBtn.addEventListener('click', async () => {
    const content = document.getElementById('modal-comment-text').value.trim();
    const typeBtn = document.querySelector('#modal-comment-type-buttons button.active');
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
  document.getElementById('modal-comment-text').value = '';
  document.getElementById('commentModal').style.display = 'flex';

  // reset type to Note
  document.querySelectorAll('#modal-comment-type-buttons button').forEach((b) => b.classList.remove('active'));
  document.querySelector('#modal-comment-type-buttons button[data-type="Note"]')?.classList.add('active');
}

export function closeRealtorCommentModal() {
  document.getElementById('commentModal').style.display = 'none';
  currentRealtorId = null;
}

