export function initEmailActivity({ contactId } = {}) {
  if (!contactId) return;

  const getEmailErrorLabel =
    typeof window !== 'undefined' && typeof window.getEmailErrorLabel === 'function'
      ? window.getEmailErrorLabel
      : (value) => (value ? String(value) : null);
  const pauseToggle = document.querySelector('[data-email-pause-toggle]');
  const pauseMeta = document.querySelector('[data-email-pause-meta]');
  const queueLink = document.querySelector('[data-email-queue-link]');
  const upcomingNode = document.querySelector('[data-email-upcoming]');
  const recentNode = document.querySelector('[data-email-recent]');
  const toast = document.querySelector('[data-email-activity-toast]');
  const pausedBadge = document.querySelector('[data-email-paused-badge]');

  if (queueLink) {
    queueLink.href = `/task?view=settings&tab=queue&contactId=${encodeURIComponent(contactId)}`;
  }

  const showToast = (message, variant = 'info') => {
    if (!toast) return;
    toast.textContent = message;
    toast.dataset.variant = variant;
    toast.dataset.timestamp = Date.now().toString();
  };

  const apiRequest = async (url, options = {}) => {
    const response = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(options.headers || {})
      },
      body: options.body
    });

    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = new Error((payload && payload.error) || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }

    return payload || {};
  };

  const formatDateTime = (value) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString();
  };

  const renderUpcoming = (items) => {
    if (!upcomingNode) return;
    if (!items.length) {
      upcomingNode.textContent = 'No upcoming emails.';
      return;
    }
    upcomingNode.innerHTML = items
      .map((item) => {
        const canCancel = item.status === 'queued';
        return `
          <div class="email-activity-item">
            <div>
              <div class="fw-semibold">${item.templateName || 'Email'}</div>
              <div class="email-activity-meta">${formatDateTime(item.scheduledFor)} • ${item.reasonLabel}</div>
            </div>
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-light text-dark border text-capitalize">${item.status}</span>
              ${
                canCancel
                  ? `<button class="btn btn-sm btn-outline-danger" data-email-cancel="${item._id}">Cancel</button>`
                  : ''
              }
            </div>
          </div>
        `;
      })
      .join('');
  };

  const renderRecent = (items) => {
    if (!recentNode) return;
    if (!items.length) {
      recentNode.textContent = 'No recent email activity.';
      return;
    }
    recentNode.innerHTML = items
      .map((item) => `
        <div class="email-activity-item">
          <div>
            <div class="fw-semibold">${item.templateName || 'Email'}</div>
            <div class="email-activity-meta">
              ${formatDateTime(item.sentAt || item.updatedAt)} • ${item.reasonLabel}
            </div>
          </div>
          <div class="text-end">
            <span class="badge bg-light text-dark border text-capitalize">${item.status}</span>
            ${item.lastError ? `<div class="email-activity-meta">${getEmailErrorLabel(item.lastError)}</div>` : ''}
          </div>
        </div>
      `)
      .join('');
  };

  const loadActivity = async () => {
    try {
      const data = await apiRequest(`/api/contacts/${contactId}/email-activity`);
      if (pauseToggle) pauseToggle.checked = Boolean(data.paused);
      if (pauseMeta) {
        pauseMeta.textContent = data.pausedAt
          ? `Paused at ${formatDateTime(data.pausedAt)}`
          : data.paused
            ? 'Paused'
            : 'Active';
      }
      if (pausedBadge) {
        pausedBadge.classList.toggle('d-none', !data.paused);
        if (data.pausedAt) {
          pausedBadge.title = `Automated emails and blasts are paused. Paused at ${formatDateTime(data.pausedAt)}.`;
        } else {
          pausedBadge.title = 'Automated emails and blasts are paused for this contact.';
        }
      }
      renderUpcoming(Array.isArray(data.upcoming) ? data.upcoming : []);
      renderRecent(Array.isArray(data.recent) ? data.recent : []);
    } catch (err) {
      console.error('[contact-email] load failed', err);
      showToast(err.message || 'Unable to load email activity.', 'error');
    }
  };

  window.addEventListener('email-activity:refresh', () => {
    loadActivity();
  });

  pauseToggle?.addEventListener('change', async () => {
    const paused = pauseToggle.checked;
    try {
      await apiRequest(`/api/contacts/${contactId}/email-pause`, {
        method: 'POST',
        body: JSON.stringify({ paused })
      });
      showToast(paused ? 'Emails paused.' : 'Emails resumed.', 'success');
      loadActivity();
    } catch (err) {
      pauseToggle.checked = !paused;
      showToast(err.message || 'Unable to update pause status.', 'error');
    }
  });

  upcomingNode?.addEventListener('click', async (event) => {
    const cancelButton = event.target.closest('[data-email-cancel]');
    if (!cancelButton) return;
    const jobId = cancelButton.dataset.emailCancel;
    if (!jobId) return;
    try {
      await apiRequest(`/api/email/queue/${jobId}/cancel`, { method: 'POST' });
      showToast('Email job canceled.', 'success');
      loadActivity();
    } catch (err) {
      showToast(err.message || 'Unable to cancel email job.', 'error');
    }
  });

  loadActivity();
}
