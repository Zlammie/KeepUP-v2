// /assets/js/contacts/modal.js
import { postComment } from './api.js';

let currentCommentContactId = null;

export function initModal() {
  const modal = document.getElementById('commentModal');
  const saveBtn = document.getElementById('saveModalComment');
  const cancelBtn = document.getElementById('cancelModalComment'); // NEW
  const typeNavBtns = document.querySelectorAll('#modal-comment-type-buttons button');

  // icon toggle
  typeNavBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      typeNavBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // save
  saveBtn.addEventListener('click', async () => {
    const content = document.getElementById('modal-comment-text').value.trim();
    const typeBtn = document.querySelector('#modal-comment-type-buttons button.active');
    const type = typeBtn ? typeBtn.getAttribute('data-type') : 'Note';
    if (!content || !currentCommentContactId) return;

    await postComment({ type, content, contactId: currentCommentContactId });
    closeCommentModal();
  });

  // cancel button — closes modal
  cancelBtn?.addEventListener('click', () => closeCommentModal()); // NEW

  // click outside content to close (optional)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeCommentModal();
  });

  // Esc to close (optional)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') {
      closeCommentModal();
    }
  });
}

export function openCommentModal(contactId) {
  currentCommentContactId = contactId;
  document.getElementById('modal-comment-text').value = '';
  document.getElementById('commentModal').style.display = 'flex';

  // reset icon selection to Note
  document
    .querySelectorAll('#modal-comment-type-buttons button')
    .forEach((b) => b.classList.remove('active'));
  document
    .querySelector('#modal-comment-type-buttons button[data-type="Note"]')
    .classList.add('active');
}

export function closeCommentModal() {
  document.getElementById('commentModal').style.display = 'none';
  currentCommentContactId = null;
}
