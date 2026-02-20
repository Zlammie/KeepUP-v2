(() => {
  const els = {
    profileForm: document.getElementById('brzProfileForm'),
    profileStatus: document.getElementById('brzProfileStatus'),
    builderName: document.getElementById('brzBuilderName'),
    builderSlug: document.getElementById('brzBuilderSlug'),
    displayNameOverride: document.getElementById('brzDisplayNameOverride'),
    shortDescription: document.getElementById('brzShortDescription'),
    longDescription: document.getElementById('brzLongDescription'),
    ctaWebsite: document.getElementById('brzCtaWebsite'),
    ctaSchedule: document.getElementById('brzCtaSchedule'),
    ctaContact: document.getElementById('brzCtaContact'),
    heroPreview: document.getElementById('brzHeroPreview'),
    heroUpload: document.getElementById('brzHeroUpload'),
    heroUploadBtn: document.getElementById('brzHeroUploadBtn'),
    communitiesBody: document.getElementById('brzCommunitiesBody'),
    floorPlansBody: document.getElementById('brzFloorPlansBody'),
    publishVersion: document.getElementById('brzPublishVersion'),
    publishAt: document.getElementById('brzPublishAt'),
    previewLink: document.getElementById('brzPreviewLink'),
    publishBtn: document.getElementById('brzPublishBtn'),
    publishStatus: document.getElementById('brzPublishStatus'),
    profileSaveBtn: document.getElementById('brzProfileSaveBtn')
  };

  const state = {
    company: null,
    profileDraft: null,
    communities: [],
    floorPlans: [],
    latestSnapshot: null
  };

  const escapeHtml = (value) =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const toText = (value) => (value == null ? '' : String(value).trim());

  const setStatus = (el, message, tone = 'muted') => {
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('brz-status-muted', 'brz-status-success', 'brz-status-error', 'text-muted', 'text-success', 'text-danger');
    if (tone === 'success') {
      el.classList.add('brz-status-success', 'text-success');
      return;
    }
    if (tone === 'error') {
      el.classList.add('brz-status-error', 'text-danger');
      return;
    }
    el.classList.add('brz-status-muted', 'text-muted');
  };

  const updateImagePreview = (imgEl, imageMeta) => {
    if (!imgEl) return;
    const url = toText(imageMeta?.url);
    if (!url) {
      imgEl.classList.add('d-none');
      imgEl.removeAttribute('src');
      return;
    }
    imgEl.src = url;
    imgEl.classList.remove('d-none');
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
  };

  const parseJsonResponse = async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  };

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers || {})
      },
      ...options
    });
    return parseJsonResponse(response);
  };

  const refreshPublishCard = () => {
    if (els.publishVersion) {
      els.publishVersion.textContent = state.latestSnapshot?.version ? `v${state.latestSnapshot.version}` : '-';
    }
    if (els.publishAt) {
      els.publishAt.textContent = formatDate(state.latestSnapshot?.publishedAt);
    }
    if (els.previewLink) {
      const slug = toText(state.profileDraft?.builderSlug);
      if (!slug) {
        els.previewLink.href = '#';
        els.previewLink.classList.add('disabled');
      } else {
        els.previewLink.href = `/public/brz/builders/${encodeURIComponent(slug)}`;
        els.previewLink.classList.remove('disabled');
      }
    }
  };

  const applyProfileToForm = () => {
    const profile = state.profileDraft || {};
    if (els.builderName) els.builderName.value = state.company?.name || '';
    if (els.builderSlug) els.builderSlug.value = profile.builderSlug || '';
    if (els.displayNameOverride) els.displayNameOverride.value = profile.displayNameOverride || '';
    if (els.shortDescription) els.shortDescription.value = profile.shortDescription || '';
    if (els.longDescription) els.longDescription.value = profile.longDescription || '';
    if (els.ctaWebsite) els.ctaWebsite.value = profile.ctaLinks?.website || '';
    if (els.ctaSchedule) els.ctaSchedule.value = profile.ctaLinks?.schedule || '';
    if (els.ctaContact) els.ctaContact.value = profile.ctaLinks?.contact || '';
    updateImagePreview(els.heroPreview, profile.heroImage);
    refreshPublishCard();
  };

  const renderCommunities = () => {
    if (!els.communitiesBody) return;
    if (!Array.isArray(state.communities) || !state.communities.length) {
      els.communitiesBody.innerHTML = '<tr><td colspan="4" class="text-muted">No linked communities found.</td></tr>';
      return;
    }

    els.communitiesBody.innerHTML = state.communities
      .map((entry) => {
        const community = entry.community || {};
        const draft = entry.draft || {};
        return `
          <tr data-community-id="${escapeHtml(community.id)}">
            <td>
              <div class="fw-semibold">${escapeHtml(community.name || 'Community')}</div>
              <div class="small text-muted">${escapeHtml([community.city, community.state].filter(Boolean).join(', '))}</div>
            </td>
            <td>
              <input class="form-check-input brz-community-include" type="checkbox" ${draft.isIncluded ? 'checked' : ''} />
            </td>
            <td>
              <textarea class="form-control form-control-sm brz-community-description" rows="2">${escapeHtml(draft.descriptionOverride || '')}</textarea>
            </td>
            <td>
              <div class="d-flex flex-column gap-1">
                <button type="button" class="btn btn-sm btn-outline-primary brz-community-save">Save</button>
                <small class="brz-row-status brz-status-muted"></small>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    els.communitiesBody.querySelectorAll('.brz-community-save').forEach((button) => {
      button.addEventListener('click', async (event) => {
        const row = event.currentTarget.closest('tr[data-community-id]');
        if (!row) return;
        const communityId = row.getAttribute('data-community-id');
        const includeEl = row.querySelector('.brz-community-include');
        const descriptionEl = row.querySelector('.brz-community-description');
        const statusEl = row.querySelector('.brz-row-status');
        button.disabled = true;
        setStatus(statusEl, 'Saving...', 'muted');
        try {
          const payload = {
            isIncluded: Boolean(includeEl?.checked),
            descriptionOverride: toText(descriptionEl?.value)
          };
          const data = await fetchJson(`/api/brz/publishing/community/${encodeURIComponent(communityId)}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
          });
          const idx = state.communities.findIndex((item) => item.community?.id === communityId);
          if (idx >= 0) state.communities[idx] = { community: data.community, draft: data.draft };
          setStatus(statusEl, 'Saved', 'success');
        } catch (err) {
          setStatus(statusEl, err.message || 'Save failed', 'error');
        } finally {
          button.disabled = false;
        }
      });
    });
  };

  const renderFloorPlans = () => {
    if (!els.floorPlansBody) return;
    if (!Array.isArray(state.floorPlans) || !state.floorPlans.length) {
      els.floorPlansBody.innerHTML = '<tr><td colspan="6" class="text-muted">No linked floor plans found.</td></tr>';
      return;
    }

    els.floorPlansBody.innerHTML = state.floorPlans
      .map((entry) => {
        const floorPlan = entry.floorPlan || {};
        const draft = entry.draft || {};
        const specs = [floorPlan.beds, floorPlan.baths, floorPlan.sqft].every((value) => value != null)
          ? `${floorPlan.beds} bd | ${floorPlan.baths} ba | ${floorPlan.sqft} sqft`
          : '';
        return `
          <tr data-floorplan-id="${escapeHtml(floorPlan.id)}">
            <td>
              <div class="fw-semibold">${escapeHtml(floorPlan.name || 'Floor Plan')}</div>
              <div class="small text-muted">${escapeHtml(floorPlan.planNumber || '')}</div>
              <div class="small text-muted">${escapeHtml(specs)}</div>
            </td>
            <td>${escapeHtml(floorPlan.communityName || '-')}</td>
            <td>
              <input class="form-check-input brz-floorplan-include" type="checkbox" ${draft.isIncluded ? 'checked' : ''} />
            </td>
            <td>
              <textarea class="form-control form-control-sm brz-floorplan-description" rows="2">${escapeHtml(draft.descriptionOverride || '')}</textarea>
            </td>
            <td>
              <div class="d-flex flex-column gap-2">
                <img class="brz-image-preview ${draft.primaryImage?.url ? '' : 'd-none'}" src="${escapeHtml(draft.primaryImage?.url || '')}" alt="Primary floor plan image" />
                <input class="form-control form-control-sm brz-floorplan-upload" type="file" accept="image/*" />
                <button type="button" class="btn btn-sm btn-outline-secondary brz-floorplan-upload-btn">Upload</button>
              </div>
            </td>
            <td>
              <div class="d-flex flex-column gap-1">
                <button type="button" class="btn btn-sm btn-outline-primary brz-floorplan-save">Save</button>
                <small class="brz-row-status brz-status-muted"></small>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    els.floorPlansBody.querySelectorAll('tr[data-floorplan-id]').forEach((row) => {
      const floorPlanId = row.getAttribute('data-floorplan-id');
      const saveBtn = row.querySelector('.brz-floorplan-save');
      const uploadBtn = row.querySelector('.brz-floorplan-upload-btn');
      const uploadInput = row.querySelector('.brz-floorplan-upload');
      const includeEl = row.querySelector('.brz-floorplan-include');
      const descriptionEl = row.querySelector('.brz-floorplan-description');
      const statusEl = row.querySelector('.brz-row-status');
      const imageEl = row.querySelector('.brz-image-preview');

      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          saveBtn.disabled = true;
          setStatus(statusEl, 'Saving...', 'muted');
          try {
            const payload = {
              isIncluded: Boolean(includeEl?.checked),
              descriptionOverride: toText(descriptionEl?.value)
            };
            const data = await fetchJson(`/api/brz/publishing/floorplan/${encodeURIComponent(floorPlanId)}`, {
              method: 'PUT',
              body: JSON.stringify(payload)
            });
            const idx = state.floorPlans.findIndex((item) => item.floorPlan?.id === floorPlanId);
            if (idx >= 0) {
              state.floorPlans[idx] = {
                floorPlan: data.floorPlan || state.floorPlans[idx].floorPlan,
                draft: data.draft || state.floorPlans[idx].draft
              };
            }
            setStatus(statusEl, 'Saved', 'success');
          } catch (err) {
            setStatus(statusEl, err.message || 'Save failed', 'error');
          } finally {
            saveBtn.disabled = false;
          }
        });
      }

      if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
          const file = uploadInput?.files?.[0];
          if (!file) {
            setStatus(statusEl, 'Choose an image first', 'error');
            return;
          }
          uploadBtn.disabled = true;
          setStatus(statusEl, 'Uploading...', 'muted');
          try {
            const formData = new FormData();
            formData.append('file', file);
            const data = await fetchJson(
              `/api/brz/publishing/upload?type=floorplan&floorPlanId=${encodeURIComponent(floorPlanId)}`,
              { method: 'POST', body: formData }
            );
            const floorPlanPayload = data?.floorPlan || null;
            const idx = state.floorPlans.findIndex((item) => item.floorPlan?.id === floorPlanId);
            if (idx >= 0 && floorPlanPayload) state.floorPlans[idx] = floorPlanPayload;
            updateImagePreview(imageEl, data?.image || floorPlanPayload?.draft?.primaryImage);
            if (uploadInput) uploadInput.value = '';
            setStatus(statusEl, 'Uploaded', 'success');
          } catch (err) {
            setStatus(statusEl, err.message || 'Upload failed', 'error');
          } finally {
            uploadBtn.disabled = false;
          }
        });
      }
    });
  };

  const saveProfile = async () => {
    if (!els.profileSaveBtn) return;
    els.profileSaveBtn.disabled = true;
    setStatus(els.profileStatus, 'Saving...', 'muted');
    try {
      const payload = {
        builderSlug: toText(els.builderSlug?.value),
        displayNameOverride: toText(els.displayNameOverride?.value),
        shortDescription: toText(els.shortDescription?.value),
        longDescription: toText(els.longDescription?.value),
        ctaLinks: {
          website: toText(els.ctaWebsite?.value),
          schedule: toText(els.ctaSchedule?.value),
          contact: toText(els.ctaContact?.value)
        }
      };
      const data = await fetchJson('/api/brz/publishing/profile', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      state.profileDraft = data.profileDraft || payload;
      applyProfileToForm();
      setStatus(els.profileStatus, 'Saved', 'success');
    } catch (err) {
      setStatus(els.profileStatus, err.message || 'Save failed', 'error');
    } finally {
      els.profileSaveBtn.disabled = false;
    }
  };

  const uploadHero = async () => {
    const file = els.heroUpload?.files?.[0];
    if (!file) {
      setStatus(els.profileStatus, 'Choose an image first', 'error');
      return;
    }
    if (els.heroUploadBtn) els.heroUploadBtn.disabled = true;
    setStatus(els.profileStatus, 'Uploading hero image...', 'muted');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await fetchJson('/api/brz/publishing/upload?type=hero', {
        method: 'POST',
        body: formData
      });
      if (data?.profileDraft) {
        state.profileDraft = data.profileDraft;
      } else {
        state.profileDraft = {
          ...(state.profileDraft || {}),
          heroImage: data?.image || null
        };
      }
      applyProfileToForm();
      if (els.heroUpload) els.heroUpload.value = '';
      setStatus(els.profileStatus, 'Hero image uploaded', 'success');
    } catch (err) {
      setStatus(els.profileStatus, err.message || 'Upload failed', 'error');
    } finally {
      if (els.heroUploadBtn) els.heroUploadBtn.disabled = false;
    }
  };

  const publishSnapshot = async () => {
    if (!els.publishBtn) return;
    els.publishBtn.disabled = true;
    setStatus(els.publishStatus, 'Publishing snapshot...', 'muted');
    try {
      const data = await fetchJson('/api/brz/publishing/publish', { method: 'POST' });
      state.latestSnapshot = {
        version: data.version,
        publishedAt: data.publishedAt,
        builderSlug: data.builderSlug || state.profileDraft?.builderSlug || ''
      };
      refreshPublishCard();
      setStatus(els.publishStatus, `Published version ${data.version}`, 'success');
    } catch (err) {
      setStatus(els.publishStatus, err.message || 'Publish failed', 'error');
    } finally {
      els.publishBtn.disabled = false;
    }
  };

  const hydrateFromBootstrap = (payload) => {
    state.company = payload?.company || null;
    state.profileDraft = payload?.profileDraft || {};
    state.communities = Array.isArray(payload?.communities) ? payload.communities : [];
    state.floorPlans = Array.isArray(payload?.floorPlans) ? payload.floorPlans : [];
    state.latestSnapshot = payload?.latestSnapshot || null;

    applyProfileToForm();
    renderCommunities();
    renderFloorPlans();
  };

  const loadBootstrap = async () => {
    setStatus(els.publishStatus, 'Loading publishing data...', 'muted');
    try {
      const payload = await fetchJson('/api/brz/publishing/bootstrap');
      hydrateFromBootstrap(payload);
      setStatus(els.publishStatus, '', 'muted');
    } catch (err) {
      setStatus(els.publishStatus, err.message || 'Failed to load publishing data', 'error');
      if (els.communitiesBody) {
        els.communitiesBody.innerHTML = '<tr><td colspan="4" class="text-danger">Failed to load communities.</td></tr>';
      }
      if (els.floorPlansBody) {
        els.floorPlansBody.innerHTML = '<tr><td colspan="6" class="text-danger">Failed to load floor plans.</td></tr>';
      }
    }
  };

  if (els.profileForm) {
    els.profileForm.addEventListener('submit', (event) => {
      event.preventDefault();
      saveProfile();
    });
  }

  if (els.heroUploadBtn) {
    els.heroUploadBtn.addEventListener('click', () => {
      uploadHero();
    });
  }

  if (els.publishBtn) {
    els.publishBtn.addEventListener('click', () => {
      publishSnapshot();
    });
  }

  loadBootstrap();
})();
