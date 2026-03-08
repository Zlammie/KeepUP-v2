/* assets/js/pages/email/blast-details.js */
(function blastDetailsController() {
  const DATA_NODE_ID = 'blast-details-data';

  function parseInitialData() {
    const node = document.getElementById(DATA_NODE_ID);
    if (!node) return {};
    try {
      return JSON.parse(node.textContent || '{}');
    } catch (err) {
      console.error('[blast-details] failed to parse initial data', err);
      return {};
    } finally {
      if (node.parentNode) node.parentNode.removeChild(node);
    }
  }

  async function apiRequest(url, options = {}) {
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
      } catch (err) {
        payload = null;
      }
    }

    if (!response.ok) {
      const error = new Error((payload && payload.error) || `Request failed (${response.status})`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload || {};
  }

  function showToast(region, message, variant = 'info') {
    if (!region) return;
    region.textContent = message;
    region.dataset.variant = variant;
    region.dataset.timestamp = Date.now().toString();
  }

  function formatDateTime(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString();
  }

  function summarizeFilters(blast) {
    const filters = blast?.audience?.filters || {};
    if (blast?.audienceType === 'realtors') {
      const parts = [];
      if (filters.communityId) parts.push(`Community: ${filters.communityId}`);
      if (filters.managerId) parts.push(`Manager: ${filters.managerId}`);
      if (filters.textSearch) parts.push(`Search: ${filters.textSearch}`);
      if (filters.includeInactive) parts.push('Include inactive');
      return parts.length ? `Filters: ${parts.join(', ')}` : null;
    }
    const parts = [];
    if (Array.isArray(filters.communityIds) && filters.communityIds.length) {
      parts.push(`Communities: ${filters.communityIds.length}`);
    }
    if (Array.isArray(filters.statuses) && filters.statuses.length) {
      parts.push(`Statuses: ${filters.statuses.length}`);
    }
    if (Array.isArray(filters.tags) && filters.tags.length) {
      parts.push(`Tags: ${filters.tags.length}`);
    }
    if (filters.linkedLot) parts.push('Linked lot only');
    return parts.length ? `Filters: ${parts.join(', ')}` : null;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const initialData = parseInitialData();
    const blastId = initialData.blastId;
    const blastEndpoint = initialData.endpoints?.blast || '/api/email/blasts';
    const queueBase = initialData.endpoints?.queue || '/task?view=settings&tab=queue';

    const blastName = document.querySelector('[data-blast-name]');
    const blastStatus = document.querySelector('[data-blast-status]');
    const blastMeta = document.querySelector('[data-blast-meta]');
    const blastPacing = document.querySelector('[data-blast-pacing]');
    const countsNode = document.querySelector('[data-blast-counts]');
    const recentSent = document.querySelector('[data-recent-sent]');
    const recentFailed = document.querySelector('[data-recent-failed]');
    const recentSkipped = document.querySelector('[data-recent-skipped]');
    const cancelButton = document.querySelector('[data-cancel-blast]');
    const pauseButton = document.querySelector('[data-pause-blast]');
    const resumeButton = document.querySelector('[data-resume-blast]');
    const openQueue = document.querySelector('[data-open-queue]');
    const toast = document.querySelector('[data-blast-toast]');
    let currentBlastStatus = '';
    const getEmailErrorLabel =
      typeof window !== 'undefined' && typeof window.getEmailErrorLabel === 'function'
        ? window.getEmailErrorLabel
        : (value) => (value ? String(value) : null);

    if (openQueue && blastId) {
      openQueue.href = `${queueBase}&blastId=${encodeURIComponent(blastId)}`;
    }

    function renderCounts(counts) {
      if (!countsNode) return;
      const items = [
        { label: 'Total', value: counts?.totalJobs ?? 0 },
        { label: 'Queued', value: counts?.queued ?? 0 },
        { label: 'Processing', value: counts?.processing ?? 0 },
        { label: 'Sent', value: counts?.sent ?? 0 },
        { label: 'Failed', value: counts?.failed ?? 0 },
        { label: 'Skipped', value: counts?.skipped ?? 0 },
        { label: 'Canceled', value: counts?.canceled ?? 0 },
        { label: 'Due now', value: counts?.dueNow ?? 0 },
        { label: 'Retrying', value: counts?.retrying ?? 0 }
      ];
      countsNode.innerHTML = items
        .map(
          (item) => `
            <div class="col-6 col-md-4 col-lg-3">
              <div class="stat-card">
                <div class="text-muted small">${item.label}</div>
                <div class="h5 mb-0">${item.value}</div>
              </div>
            </div>
          `
        )
        .join('');
    }

    function renderRecent(node, items, fallback) {
      if (!node) return;
      if (!Array.isArray(items) || !items.length) {
        node.textContent = fallback;
        return;
      }
      node.innerHTML = items
        .map((item) => `
          <div class="mb-2">
            <div class="fw-semibold">${item.to || 'Recipient'}</div>
            <div class="text-muted">${formatDateTime(item.sentAt || item.updatedAt)}${item.lastError ? ` • ${getEmailErrorLabel(item.lastError)}` : ''}</div>
          </div>
        `)
        .join('');
    }

    function updateHeader(blast) {
      if (!blast) return;
      if (blastName) blastName.textContent = blast.name || 'Blast Details';
      if (blastStatus) {
        const statusValue = String(blast.status || 'scheduled').toLowerCase();
        const badgeClasses = {
          paused: 'badge bg-warning text-dark text-uppercase',
          canceled: 'badge bg-danger text-white text-uppercase',
          completed: 'badge bg-success text-white text-uppercase',
          sending: 'badge bg-primary text-white text-uppercase',
          scheduled: 'badge bg-primary text-white text-uppercase',
          draft: 'badge bg-light text-dark border text-uppercase'
        };
        blastStatus.textContent = statusValue.toUpperCase();
        blastStatus.className = badgeClasses[statusValue] || 'badge bg-light text-dark border text-uppercase';
      }
      const filterSummary = summarizeFilters(blast);
      const parts = [
        `Status: ${blast.status || 'scheduled'}`,
        `Created: ${formatDateTime(blast.createdAt)}`,
        blast.scheduledFor ? `Scheduled: ${formatDateTime(blast.scheduledFor)}` : null,
        blast.templateName ? `Template: ${blast.templateName}` : null,
        blast.audienceType ? `Audience: ${blast.audienceType}` : null,
        filterSummary
      ].filter(Boolean);
      if (blastMeta) blastMeta.textContent = parts.join(' • ');
      if (blastPacing) {
        const pacing = blast.pacingSummary || null;
        if (pacing?.firstSendAt && pacing?.lastSendAt) {
          const days = pacing.daysSpanned ? ` • ${pacing.daysSpanned} day${pacing.daysSpanned === 1 ? '' : 's'}` : '';
          blastPacing.textContent = `Planned sends: ${formatDateTime(pacing.firstSendAt)} → ${formatDateTime(pacing.lastSendAt)}${days}`;
          blastPacing.hidden = false;
        } else {
          blastPacing.textContent = '';
          blastPacing.hidden = true;
        }
      }
      const status = String(blast.status || '').toLowerCase();
      currentBlastStatus = status;
      if (cancelButton) {
        cancelButton.classList.toggle('d-none', ['canceled', 'completed'].includes(status));
      }
      if (pauseButton) {
        pauseButton.classList.toggle('d-none', !['scheduled', 'sending'].includes(status));
      }
      if (resumeButton) {
        resumeButton.classList.toggle('d-none', status !== 'paused');
      }
    }

    async function loadDetails() {
      if (!blastId) return;
      try {
        const response = await apiRequest(`${blastEndpoint}/${blastId}`);
        updateHeader(response.blast);
        renderCounts(response.counts);
        renderRecent(recentSent, response.recent?.sent, 'No sent jobs yet.');
        renderRecent(recentFailed, response.recent?.failed, 'No failed jobs.');
        renderRecent(recentSkipped, response.recent?.skipped, 'No skipped jobs.');
      } catch (err) {
        console.error('[blast-details] load failed', err);
        showToast(toast, err.message || 'Unable to load blast details.', 'error');
      }
    }

    cancelButton?.addEventListener('click', async () => {
      if (!blastId) return;
      try {
        await apiRequest(`${blastEndpoint}/${blastId}/cancel`, { method: 'POST' });
        showToast(toast, 'Blast canceled.', 'success');
        await loadDetails();
      } catch (err) {
        console.error('[blast-details] cancel failed', err);
        showToast(toast, err.message || 'Unable to cancel blast.', 'error');
      }
    });

    pauseButton?.addEventListener('click', async () => {
      if (!blastId) return;
      if (pauseButton.disabled) return;
      if (currentBlastStatus === 'paused') {
        await loadDetails();
        return;
      }
      const confirmed = window.confirm(
        'Pausing will stop remaining scheduled emails from sending. Emails already sent are not affected.'
      );
      if (!confirmed) return;
      try {
        pauseButton.disabled = true;
        await apiRequest(`${blastEndpoint}/${blastId}/pause`, { method: 'POST' });
        showToast(toast, 'Blast paused.', 'success');
        await loadDetails();
      } catch (err) {
        console.error('[blast-details] pause failed', err);
        showToast(toast, err.message || 'Unable to pause blast.', 'error');
      } finally {
        pauseButton.disabled = false;
      }
    });

    resumeButton?.addEventListener('click', async () => {
      if (!blastId) return;
      if (resumeButton.disabled) return;
      if (currentBlastStatus !== 'paused') {
        await loadDetails();
        return;
      }
      const confirmed = window.confirm(
        'Resuming will continue sending remaining emails using the original pacing and schedule.'
      );
      if (!confirmed) return;
      try {
        resumeButton.disabled = true;
        await apiRequest(`${blastEndpoint}/${blastId}/resume`, { method: 'POST' });
        showToast(toast, 'Blast resumed.', 'success');
        await loadDetails();
      } catch (err) {
        console.error('[blast-details] resume failed', err);
        showToast(toast, err.message || 'Unable to resume blast.', 'error');
      } finally {
        resumeButton.disabled = false;
      }
    });

    loadDetails();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadDetails();
      }
    }, 30000);
    window.addEventListener('beforeunload', () => window.clearInterval(timer));
  });
})();
