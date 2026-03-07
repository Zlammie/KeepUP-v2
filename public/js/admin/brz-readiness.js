(function () {
  const STORAGE_KEY = 'brzReadinessBulkStatus';

  const selectAll = document.getElementById('brzSelectAllRows');
  const rowCheckboxes = Array.from(document.querySelectorAll('.brz-row-select'));
  const communitySelectButtons = Array.from(document.querySelectorAll('.brz-community-select-btn'));
  const communityPublishButtons = Array.from(document.querySelectorAll('.brz-community-publish-btn'));
  const communityUnpublishButtons = Array.from(document.querySelectorAll('.brz-community-unpublish-btn'));
  const publishButton = document.getElementById('brzBulkPublishBtn');
  const unpublishButton = document.getElementById('brzBulkUnpublishBtn');
  const publishAndSyncButton = document.getElementById('brzBulkPublishAndSyncBtn');
  const unpublishAndSyncButton = document.getElementById('brzBulkUnpublishAndSyncBtn');
  const statusEl = document.getElementById('brzBulkActionStatus');
  const countEl = document.getElementById('brzBulkSelectionCount');

  if (!publishButton || !unpublishButton || !publishAndSyncButton || !unpublishAndSyncButton || !statusEl || !countEl) {
    return;
  }

  let isSubmitting = false;

  const setStatus = (message, tone) => {
    statusEl.textContent = message || '';
    statusEl.classList.remove('text-muted', 'text-success', 'text-danger');
    if (tone === 'success') {
      statusEl.classList.add('text-success');
      return;
    }
    if (tone === 'error') {
      statusEl.classList.add('text-danger');
      return;
    }
    statusEl.classList.add('text-muted');
  };

  const readFlashStatus = () => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(STORAGE_KEY);
      const parsed = JSON.parse(raw);
      setStatus(parsed.message || '', parsed.tone || 'muted');
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  };

  const getSelectedCheckboxes = () => rowCheckboxes.filter((checkbox) => checkbox.checked);

  const matchesCommunityMode = (checkbox, communityId, mode) => {
    if (String(checkbox.dataset.communityId || '').trim() !== String(communityId || '').trim()) {
      return false;
    }

    const readiness = String(checkbox.dataset.readiness || '').trim();
    if (mode === 'ready') return readiness === 'ready';
    if (mode === 'ready-warning') return ['ready', 'warning'].includes(readiness);
    if (mode === 'published') return String(checkbox.dataset.published || '').trim() === 'true';
    if (mode === 'clear') return true;
    return false;
  };

  const getCommunityModeCheckboxes = (communityId, mode) => (
    rowCheckboxes.filter((checkbox) => matchesCommunityMode(checkbox, communityId, mode))
  );

  const getSelectedCommunityCount = (selected) => {
    const ids = new Set(
      selected
        .map((checkbox) => String(checkbox.dataset.communityId || '').trim())
        .filter(Boolean)
    );
    return ids.size;
  };

  const syncSelectAllState = () => {
    if (!selectAll) return;
    const selectedCount = getSelectedCheckboxes().length;
    const totalCount = rowCheckboxes.length;
    selectAll.checked = totalCount > 0 && selectedCount === totalCount;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  };

  const syncActionState = () => {
    const selectedCount = getSelectedCheckboxes().length;
    countEl.textContent = `${selectedCount} selected`;
    const disabled = isSubmitting || selectedCount === 0;
    publishButton.disabled = disabled;
    unpublishButton.disabled = disabled;
    publishAndSyncButton.disabled = disabled;
    unpublishAndSyncButton.disabled = disabled;
    syncSelectAllState();
  };

  const parseResponsePayload = async (response) => {
    const text = await response.text();
    if (!text) {
      return { ok: response.ok };
    }
    try {
      return JSON.parse(text);
    } catch {
      return { ok: response.ok, message: text || 'Request failed' };
    }
  };

  const getIncompleteWarningMessage = (selected) => {
    const incomplete = selected.filter((checkbox) => checkbox.dataset.readiness === 'incomplete');
    if (!incomplete.length) return '';

    const missingItems = [];
    incomplete.forEach((checkbox) => {
      const title = String(checkbox.dataset.missingTitle || '');
      title.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => {
        if (!missingItems.includes(item)) missingItems.push(item);
      });
    });

    const sample = missingItems.slice(0, 5).join(', ');
    const suffix = missingItems.length > 5 ? ', ...' : '';
    return `${incomplete.length} selected listing${incomplete.length === 1 ? ' is' : 's are'} INCOMPLETE${sample ? ` (missing: ${sample}${suffix})` : ''}. Mark published anyway?`;
  };

  const buildFlashMessage = (payload, defaultMessage) => {
    const parts = [payload?.message || defaultMessage || 'Update complete'];
    const publishInfo = payload?.inventoryPublish;

    if (publishInfo?.counts) {
      const counts = publishInfo.counts;
      const countParts = [];
      if (typeof counts.publishedCount === 'number') countParts.push(`${counts.publishedCount} published`);
      if (typeof counts.deactivatedCount === 'number') countParts.push(`${counts.deactivatedCount} deactivated`);
      if (typeof counts.skippedCount === 'number') countParts.push(`${counts.skippedCount} skipped`);
      if (countParts.length) {
        parts.push(`Inventory: ${countParts.join(', ')}.`);
      }
    }

    const warnings = Array.isArray(publishInfo?.warnings) ? publishInfo.warnings : [];
    if (warnings.length) {
      parts.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`);
      parts.push(`Warnings: ${warnings.slice(0, 3).join('; ')}`);
    }

    return parts.join(' ').trim();
  };

  const updateCommunitySelection = (communityId, mode, { exclusive = false, announce = true } = {}) => {
    const targetCommunityId = String(communityId || '').trim();
    if (!targetCommunityId) return [];

    let changedCount = 0;
    rowCheckboxes.forEach((checkbox) => {
      if (mode === 'clear') {
        if (matchesCommunityMode(checkbox, targetCommunityId, 'clear') && checkbox.checked) {
          checkbox.checked = false;
          changedCount += 1;
        }
        return;
      }

      const isInCommunity = String(checkbox.dataset.communityId || '').trim() === targetCommunityId;
      if (!isInCommunity) return;

      const shouldSelect = matchesCommunityMode(checkbox, targetCommunityId, mode);
      if (exclusive && checkbox.checked !== shouldSelect) {
        checkbox.checked = shouldSelect;
        changedCount += 1;
        return;
      }

      if (!exclusive && shouldSelect && !checkbox.checked) {
        checkbox.checked = true;
        changedCount += 1;
      }
    });

    syncActionState();

    const matchingCheckboxes = mode === 'clear'
      ? []
      : getCommunityModeCheckboxes(targetCommunityId, mode);

    if (!announce && mode !== 'clear') {
      return matchingCheckboxes;
    }

    if (mode === 'clear') {
      setStatus(`Cleared selection for this community.`, 'muted');
      return matchingCheckboxes;
    }

    if (!changedCount) {
      setStatus(`No matching listings available in this community.`, 'muted');
      return matchingCheckboxes;
    }

    const label = mode === 'ready'
      ? 'Ready'
      : mode === 'ready-warning'
        ? 'Ready + Needs Info'
        : 'Published';
    setStatus(`Selected ${changedCount} ${label} listing${changedCount === 1 ? '' : 's'} in this community.`, 'muted');
    return matchingCheckboxes;
  };

  const applyCommunitySelection = (communityId, mode) => {
    updateCommunitySelection(communityId, mode, { exclusive: false, announce: true });
  };

  const submitBulkAction = async ({ action, alsoPublishInventory = false, items = null, customConfirmMessage = '' }) => {
    const selected = Array.isArray(items) && items.length ? items : getSelectedCheckboxes();
    if (!selected.length || isSubmitting) return;

    if (customConfirmMessage) {
      if (!window.confirm(customConfirmMessage)) {
        return;
      }
    } else {
      if (action === 'publish') {
        const warningMessage = getIncompleteWarningMessage(selected);
        if (warningMessage && !window.confirm(warningMessage)) {
          return;
        }
      }

      if (action === 'unpublish') {
        const confirmed = window.confirm(
          `Unpublish ${selected.length} listing${selected.length === 1 ? '' : 's'}? This only changes KeepUp flags; you will still need to reconcile inventory.`
        );
        if (!confirmed) return;
      }

      if (alsoPublishInventory) {
        const communityCount = getSelectedCommunityCount(selected);
        const confirmed = window.confirm(
          `This will publish inventory updates for ${communityCount} ${communityCount === 1 ? 'community' : 'communities'}. Continue?`
        );
        if (!confirmed) return;
      }
    }

    isSubmitting = true;
    setStatus(
      alsoPublishInventory ? 'Updating flags and publishing inventory...' : 'Updating publish flags...',
      'muted'
    );
    syncActionState();

    try {
      const response = await window.fetch('/admin/brz/readiness/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          alsoPublishInventory,
          items: selected.map((checkbox) => ({
            communityId: checkbox.dataset.communityId,
            lotId: checkbox.dataset.lotId
          }))
        })
      });
      const payload = await parseResponsePayload(response);

      if (!response.ok || !payload?.ok) {
        if (payload?.flagsUpdated) {
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            tone: 'error',
            message: buildFlashMessage(payload, 'Flags updated, but inventory publish failed.')
          }));
          window.location.reload();
          return;
        }
        throw new Error(payload?.message || 'Failed to update publish flags');
      }

      const skippedCount = Array.isArray(payload.skipped) ? payload.skipped.length : 0;
      const message = buildFlashMessage(payload, 'Publish flags updated.');
      const finalMessage = skippedCount ? `${message} ${skippedCount} skipped.` : message;

      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        tone: 'success',
        message: finalMessage
      }));
      window.location.reload();
    } catch (err) {
      setStatus(err?.message || 'Failed to update publish flags', 'error');
    } finally {
      isSubmitting = false;
      syncActionState();
    }
  };

  if (selectAll) {
    selectAll.addEventListener('change', () => {
      rowCheckboxes.forEach((checkbox) => {
        checkbox.checked = selectAll.checked;
      });
      syncActionState();
    });
  }

  rowCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', syncActionState);
  });

  communitySelectButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (isSubmitting) return;
      applyCommunitySelection(button.dataset.communityId, button.dataset.selectMode);
    });
  });

  communityPublishButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (isSubmitting) return;

      const communityId = button.dataset.communityId;
      const mode = button.dataset.mode;
      if (!communityId || !mode) return;

      applyCommunitySelection(communityId, mode);
      const scopedItems = getCommunityModeCheckboxes(communityId, mode);
      if (!scopedItems.length) {
        setStatus('No matching listings available in this community.', 'muted');
        return;
      }

      submitBulkAction({
        action: 'publish',
        alsoPublishInventory: true,
        items: scopedItems
      });
    });
  });

  communityUnpublishButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (isSubmitting) return;

      const communityId = button.dataset.communityId;
      if (!communityId) return;

      const scopedItems = updateCommunitySelection(communityId, 'published', {
        exclusive: true,
        announce: false
      });
      if (!scopedItems.length) {
        setStatus('No published listings available in this community.', 'muted');
        return;
      }

      submitBulkAction({
        action: 'unpublish',
        alsoPublishInventory: true,
        items: scopedItems,
        customConfirmMessage: `Unpublish ${scopedItems.length} listing${scopedItems.length === 1 ? '' : 's'} and publish inventory updates for 1 community. Continue?`
      });
    });
  });

  publishButton.addEventListener('click', () => {
    submitBulkAction({ action: 'publish', alsoPublishInventory: false });
  });
  unpublishButton.addEventListener('click', () => {
    submitBulkAction({ action: 'unpublish', alsoPublishInventory: false });
  });
  publishAndSyncButton.addEventListener('click', () => {
    submitBulkAction({ action: 'publish', alsoPublishInventory: true });
  });
  unpublishAndSyncButton.addEventListener('click', () => {
    submitBulkAction({ action: 'unpublish', alsoPublishInventory: true });
  });

  readFlashStatus();
  syncActionState();
})();
