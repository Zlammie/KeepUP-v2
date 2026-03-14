(() => {
  const els = {
    body: document.getElementById('brzDashboardPublishAuditBody'),
    status: document.getElementById('brzDashboardPublishAuditStatus')
  };

  if (!els.body) return;

  const toText = (value) => (value == null ? '' : String(value).trim());
  const toNumberOr = (value, fallback = 0) => {
    if (value == null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const toNumberOrNull = (value) => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const escapeHtml = (value) =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  const formatAuditCount = (value) => {
    const parsed = toNumberOrNull(value);
    return parsed == null ? '-' : String(parsed);
  };

  const setStatus = (message, tone = 'muted') => {
    if (!els.status) return;
    els.status.textContent = message || '';
    els.status.classList.remove('text-muted', 'text-success', 'text-danger');
    if (tone === 'success') {
      els.status.classList.add('text-success');
      return;
    }
    if (tone === 'error') {
      els.status.classList.add('text-danger');
      return;
    }
    els.status.classList.add('text-muted');
  };

  const parseJsonResponse = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  };

  const fetchJson = async (url) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    return parseJsonResponse(response);
  };

  const renderAudits = (audits) => {
    if (!Array.isArray(audits) || !audits.length) {
      els.body.innerHTML = '<tr><td colspan="7" class="text-muted">No inventory publish audit records yet.</td></tr>';
      return;
    }

    els.body.innerHTML = audits.map((audit) => {
      const id = toText(audit?.id);
      const mode = toText(audit?.mode || 'PATCH').toUpperCase();
      const modeClass = mode === 'RECONCILE' ? 'brz-audit-mode--reconcile' : 'brz-audit-mode--patch';
      const scope = audit?.scope || {};
      const result = audit?.result || {};
      const warnings = Array.isArray(audit?.warningsSample) ? audit.warningsSample : [];
      const detailsList = warnings.length
        ? `<ul class="ps-3 mt-2">${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '<div class="text-muted">No sampled warnings.</div>';
      const route = toText(audit?.initiator?.route);
      const source = toText(audit?.initiator?.source || 'unknown');
      const scopeSamples = [
        Array.isArray(scope.communityIdsSample) && scope.communityIdsSample.length
          ? `Community IDs: ${escapeHtml(scope.communityIdsSample.join(', '))}`
          : '',
        Array.isArray(scope.lotIdsSample) && scope.lotIdsSample.length
          ? `Lot IDs: ${escapeHtml(scope.lotIdsSample.join(', '))}`
          : ''
      ].filter(Boolean).join('<br>');

      return `
        <tr data-audit-id="${escapeHtml(id)}">
          <td>${escapeHtml(formatDate(audit?.createdAt))}</td>
          <td><span class="brz-audit-mode ${modeClass}">${escapeHtml(mode)}</span></td>
          <td>${escapeHtml(`communities: ${toNumberOr(scope.communityIdsCount, 0)}, lots: ${toNumberOr(scope.lotIdsCount, 0)}`)}</td>
          <td>${escapeHtml(formatAuditCount(result?.publishedCount))}</td>
          <td>${escapeHtml(formatAuditCount(result?.deactivatedCount))}</td>
          <td><span class="badge text-bg-secondary brz-audit-warning-badge">${escapeHtml(String(toNumberOr(audit?.warningsCount, 0)))}</span></td>
          <td>
            <button type="button" class="btn btn-sm btn-outline-secondary brz-audit-toggle" data-audit-id="${escapeHtml(id)}">Details</button>
          </td>
        </tr>
        <tr class="brz-audit-details-row d-none" data-audit-details="${escapeHtml(id)}">
          <td colspan="7">
            <div class="brz-audit-details">
              <div><strong>Message:</strong> ${escapeHtml(toText(audit?.message) || '-')}</div>
              <div class="mt-2"><strong>Initiator:</strong> ${escapeHtml(source)}</div>
              ${route ? `<div class="mt-1"><strong>Route:</strong> ${escapeHtml(route)}</div>` : ''}
              <div class="mt-2"><strong>Skipped:</strong> ${escapeHtml(formatAuditCount(result?.skippedCount))}</div>
              ${scopeSamples ? `<div class="mt-2"><strong>Scope samples:</strong><br>${scopeSamples}</div>` : ''}
              <div class="mt-2"><strong>Warnings:</strong>${detailsList}</div>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    els.body.querySelectorAll('.brz-audit-toggle').forEach((button) => {
      button.addEventListener('click', () => {
        const auditId = toText(button.getAttribute('data-audit-id'));
        if (!auditId) return;
        const detailsRow = els.body.querySelector(`[data-audit-details="${auditId}"]`);
        if (!detailsRow) return;
        const isHidden = detailsRow.classList.contains('d-none');
        detailsRow.classList.toggle('d-none', !isHidden);
        button.textContent = isHidden ? 'Hide' : 'Details';
      });
    });
  };

  const loadAudit = async () => {
    els.body.innerHTML = '<tr><td colspan="7" class="text-muted">Loading publish audit...</td></tr>';
    setStatus('Loading...', 'muted');
    try {
      const data = await fetchJson('/admin/brz/publish-audit');
      const audits = Array.isArray(data?.audits) ? data.audits : [];
      renderAudits(audits);
      setStatus(audits.length ? `Showing latest ${audits.length}` : 'No records yet', 'muted');
    } catch (err) {
      els.body.innerHTML = '<tr><td colspan="7" class="text-danger">Failed to load publish audit.</td></tr>';
      setStatus(err.message || 'Failed to load', 'error');
    }
  };

  loadAudit();
})();
