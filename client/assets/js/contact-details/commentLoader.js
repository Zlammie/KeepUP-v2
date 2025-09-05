// assets/js/contact-details/commentLoader.js
import { getState } from './state.js';

export function setupCommentSection() {
  const saveBtn = document.getElementById('save-comment');
  if (!saveBtn) {
    console.warn('[comments] Save button not found');
    return;
  }

  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const selectedBtn = document.querySelector('#comment-type-buttons button.active');
    const type = selectedBtn ? selectedBtn.getAttribute('data-type') : 'Note';
    const content = document.getElementById('comment-text').value.trim();
    const { contactId } = getState();

    if (!content) return alert('Comment cannot be empty');
    if (!contactId) {
      console.error('[comments] Missing contactId; cannot save.');
      return;
    }

    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content, contactId })
      });
      if (!res.ok) throw new Error(await res.text());
      document.getElementById('comment-text').value = '';
      await loadComments();
    } catch (err) {
      console.error('[comments] Save failed:', err);
      alert('Error saving comment');
    }
  });

  // Toggle active type button
  document.querySelectorAll('#comment-type-buttons button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#comment-type-buttons button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  loadComments();
}

async function loadComments() {
  const { contactId } = getState();
  if (!contactId) return;

  try {
    const res = await fetch(`/api/comments/${contactId}`);
    if (!res.ok) throw new Error(await res.text());
    const comments = await res.json();

    const container = document.getElementById('comment-history');
    if (!container) return;

    container.innerHTML = '';
    comments.forEach(comment => {
      const div = document.createElement('div');
      div.classList.add('comment-entry');
      div.innerHTML = `
        <div class="meta">${comment.type} • ${new Date(comment.timestamp).toLocaleString()}</div>
        <div>${comment.content}</div>
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error('[comments] Load failed:', err);
  }
}
