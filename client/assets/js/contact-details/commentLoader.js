async function setupCommentSection() {
  const saveBtn = document.getElementById('save-comment');
  if (!saveBtn) {
    console.warn('Save Comment button not found');
    return;
  }

  alert('setupCommentSection initialized'); // ✅ DEBUG: confirms function is running

  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    alert('Save button clicked'); // ✅ DEBUG: confirms button click

    const selectedBtn = document.querySelector('#comment-type-buttons button.active');
    const type = selectedBtn ? selectedBtn.getAttribute('data-type') : 'Note';
    const content = document.getElementById('comment-text').value.trim();
    const contactId = window.contactId;

    if (!content) {
      alert('Comment cannot be empty');
      return;
    }

    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content, contactId })
    });

    if (res.ok) {
      alert('Comment saved'); // ✅ DEBUG: success confirmation
      document.getElementById('comment-text').value = '';
      loadComments();
    } else {
      alert('Error saving comment');
      console.error(await res.text());
    }
  });

  document.querySelectorAll('#comment-type-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#comment-type-buttons button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

  loadComments();
}

async function loadComments() {
  const contactId = window.contactId;
  const res = await fetch(`/api/comments/${contactId}`);
  const comments = await res.json();

  const container = document.getElementById('comment-history');
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
}
