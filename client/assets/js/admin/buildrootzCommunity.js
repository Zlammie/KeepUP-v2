(() => {
  const communities = Array.isArray(window.__BRZ_COMMUNITIES__) ? window.__BRZ_COMMUNITIES__ : [];

  const els = {
    select: document.getElementById('brzCommunitySelect'),
    statusPill: document.getElementById('brzStatusPill'),
    communityCard: document.getElementById('brzCommunityCard'),
    searchInput: document.getElementById('brzSearch'),
    searchStatus: document.getElementById('brzSearchStatus'),
    results: document.getElementById('brzResults'),
    mapBtn: document.getElementById('brzMapBtn'),
    unmapBtn: document.getElementById('brzUnmapBtn'),
    mappingState: document.getElementById('brzMappingState'),
    searchPanel: document.getElementById('brzSearchPanel'),
    requestBtn: document.getElementById('brzRequestBtn'),
    requestForm: document.getElementById('brzRequestForm'),
    requestPending: document.getElementById('brzRequestPending'),
    requestStatusText: document.getElementById('brzRequestStatusText'),
    checkStatusBtn: document.getElementById('brzCheckStatusBtn'),
    reqName: document.getElementById('brzReqName'),
    reqCity: document.getElementById('brzReqCity'),
    reqState: document.getElementById('brzReqState'),
    reqNotes: document.getElementById('brzReqNotes'),
    reqStatus: document.getElementById('brzRequestStatus'),
    reqCancel: document.getElementById('brzReqCancel'),
    reqSubmit: document.getElementById('brzReqSubmit')
  };

  const state = {
    communities,
    selectedCommunityId: '',
    selectedBrId: '',
    searchTimer: null,
    searchResults: [],
    loadingSearch: false,
    saving: false,
    pollingTimer: null
  };

  const findCommunity = (id) => state.communities.find((c) => String(c.id) === String(id));

  const setStatusPill = (mapped) => {
    if (!els.statusPill) return;
    els.statusPill.textContent = mapped ? 'Mapped' : 'Not mapped';
    els.statusPill.classList.toggle('mapped', mapped);
    els.statusPill.classList.toggle('unmapped', !mapped);
  };

  const renderCommunityCard = (community) => {
    if (!els.communityCard) return;
    if (!community) {
      els.communityCard.innerHTML = '<p class="text-muted small mb-0">Select a community to view details.</p>';
      return;
    }
    const location = [community.city, community.state].filter(Boolean).join(', ');
    const mapped = Boolean(community.buildrootz?.communityId);
    const canonicalName = community.buildrootz?.canonicalName || '';
    const communityId = community.buildrootz?.communityId || '';
    const request = community.buildrootz?.request || {};
    els.communityCard.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <h5 class="mb-1">${community.name || 'Community'}</h5>
          <p class="text-muted mb-1">${location || 'No location set'}</p>
        </div>
        <span class="brz-pill ${mapped ? 'mapped' : 'unmapped'}">${mapped ? 'Mapped' : 'Not mapped'}</span>
      </div>
      ${
        mapped
          ? `<div class="mt-2">
              <div class="fw-semibold">BuildRootz community</div>
              <div>${canonicalName || 'Name not captured'}</div>
              <div class="text-muted small">ID: ${communityId}</div>
            </div>`
          : `<p class="text-muted mb-0">No BuildRootz mapping yet.</p>
             ${
               request?.status
                 ? `<div class="mt-2 small">Request status: <strong>${request.status}</strong>${request.requestId ? ` · ID: ${request.requestId}` : ''}</div>`
                 : ''
             }`
      }
    `;
  };

  const setMappingState = (mapped) => {
    if (els.mappingState) els.mappingState.classList.toggle('d-none', !mapped);
    if (els.unmapBtn) els.unmapBtn.disabled = !mapped || state.saving;
    if (els.searchPanel) els.searchPanel.classList.toggle('d-none', !state.selectedCommunityId);
    if (els.searchInput) els.searchInput.disabled = state.saving || !state.selectedCommunityId;
    if (els.mapBtn) els.mapBtn.disabled = state.saving || !state.selectedBrId;
    setStatusPill(mapped);
  };

  const setSearchStatus = (text, tone = 'muted') => {
    if (!els.searchStatus) return;
    els.searchStatus.textContent = text || '';
    els.searchStatus.classList.remove('text-muted', 'text-danger');
    els.searchStatus.classList.add(tone === 'danger' ? 'text-danger' : 'text-muted');
  };

  const renderResults = () => {
    if (!els.results) return;
    if (state.loadingSearch) {
      els.results.innerHTML = '<p class="text-muted small mb-0">Searching…</p>';
      return;
    }
    if (!state.searchResults.length) {
      els.results.innerHTML = '<p class="text-muted small mb-0">No matches found. Contact admin to create the canonical community in BuildRootz.</p>';
      return;
    }
    els.results.innerHTML = state.searchResults
      .map((r) => {
        const location = [r.city, r.state].filter(Boolean).join(', ');
        const checked = state.selectedBrId === r._id ? 'checked' : '';
        return `
          <label class="brz-result d-flex align-items-center gap-2 mb-2">
            <input type="radio" name="brzResult" value="${r._id}" ${checked} />
            <div>
              <div class="fw-semibold">${r.name || 'Community'}</div>
              <div class="text-muted small">${location || ''}</div>
            </div>
          </label>
        `;
      })
      .join('');
    els.results.querySelectorAll('input[name="brzResult"]').forEach((input) => {
      input.addEventListener('change', () => {
        state.selectedBrId = input.value;
        if (els.mapBtn) els.mapBtn.disabled = state.saving || !state.selectedBrId;
      });
    });
  };

  const refreshCommunities = async () => {
    const res = await fetch('/api/admin/buildrootz/communities', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    state.communities = Array.isArray(data) ? data : [];
    const selectHasOptions = Boolean(els.select);
    if (selectHasOptions) {
      const current = state.selectedCommunityId;
      els.select.innerHTML = '<option value="">Choose a community…</option>' + state.communities
        .map((c) => `<option value="${c.id}">${c.name}${(c.city || c.state) ? ` — ${[c.city, c.state].filter(Boolean).join(', ')}` : ''}</option>`)
        .join('');
      if (current) els.select.value = current;
    }
  };

  const stopPolling = () => {
    if (state.pollingTimer) {
      clearInterval(state.pollingTimer);
      state.pollingTimer = null;
    }
  };

  const updateRequestUI = (community) => {
    const reqMeta = community?.buildrootz?.request || {};
    const hasPending = reqMeta.status === 'pending';
    if (els.requestPending) {
      els.requestPending.classList.toggle('d-none', !reqMeta.status);
    }
    if (els.requestStatusText) {
      els.requestStatusText.textContent = reqMeta.status || 'pending';
    }
    if (els.checkStatusBtn) {
      els.checkStatusBtn.disabled = !reqMeta.requestId || state.saving;
    }
    if (els.requestForm) {
      // keep form hidden if already requested
      els.requestForm.classList.toggle('d-none', Boolean(reqMeta.status));
    }
    if (els.requestBtn) {
      els.requestBtn.disabled = state.saving || Boolean(reqMeta.status);
    }
    if (hasPending && !state.pollingTimer) {
      state.pollingTimer = setInterval(() => {
        if (state.selectedCommunityId) checkRequestStatus();
      }, 20000);
    }
    if (!hasPending) {
      stopPolling();
    }
  };

  const handleSelectCommunity = () => {
    const id = els.select?.value || '';
    state.selectedCommunityId = id;
    state.selectedBrId = '';
    state.searchResults = [];
    if (els.mapBtn) els.mapBtn.disabled = true;
    if (!id) {
      renderCommunityCard(null);
      setMappingState(false);
      setSearchStatus('Choose a community to start.');
      els.results.innerHTML = '';
      if (els.requestPending) els.requestPending.classList.add('d-none');
      if (els.requestForm) els.requestForm.classList.add('d-none');
      stopPolling();
      return;
    }
    const community = findCommunity(id);
    renderCommunityCard(community);
    const mapped = Boolean(community?.buildrootz?.communityId);
    setMappingState(mapped);
    setSearchStatus('Start typing to search canonical BuildRootz communities.');
    els.results.innerHTML = '';
    updateRequestUI(community);
    if (els.reqName) els.reqName.value = community?.name || '';
    if (els.reqCity) els.reqCity.value = community?.city || '';
    if (els.reqState) els.reqState.value = community?.state || '';
  };

  const performSearch = async (query) => {
    if (!state.selectedCommunityId) return;
    state.loadingSearch = true;
    renderResults();
    try {
        const res = await fetch(`/api/admin/buildrootz/br-communities/search?q=${encodeURIComponent(query)}`, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin'
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `Search failed (${res.status})`);
        const results = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
        state.searchResults = results;
      setSearchStatus(state.searchResults.length ? 'Select a canonical BuildRootz community.' : 'No matches found. Contact admin to create the canonical community in BuildRootz.');
    } catch (err) {
      console.error(err);
      setSearchStatus(err.message || 'Search failed.', 'danger');
      state.searchResults = [];
    } finally {
      state.loadingSearch = false;
      renderResults();
    }
  };

  const submitRequest = async () => {
    if (!state.selectedCommunityId || state.saving) return;
    const requestedName = els.reqName?.value.trim() || '';
    const city = els.reqCity?.value.trim() || '';
    const stateCode = els.reqState?.value.trim() || '';
    const notes = els.reqNotes?.value.trim() || '';
    if (!requestedName || !city || !stateCode) {
      if (els.reqStatus) els.reqStatus.textContent = 'Name, city, and state are required.';
      return;
    }
    state.saving = true;
    if (els.reqSubmit) els.reqSubmit.disabled = true;
    if (els.reqStatus) els.reqStatus.textContent = 'Submitting request...';
    try {
      const res = await fetch('/api/admin/buildrootz/community-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          keepupCommunityId: state.selectedCommunityId,
          requestedName,
          city,
          state: stateCode,
          notes
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
      await refreshCommunities();
      const updated = findCommunity(state.selectedCommunityId);
      renderCommunityCard(updated);
      updateRequestUI(updated);
      if (els.reqStatus) els.reqStatus.textContent = 'Request submitted. We will review it shortly.';
    } catch (err) {
      console.error(err);
      if (els.reqStatus) els.reqStatus.textContent = err.message || 'Request failed.';
    } finally {
      state.saving = false;
      if (els.reqSubmit) els.reqSubmit.disabled = false;
    }
  };

  const checkRequestStatus = async () => {
    if (!state.selectedCommunityId) return;
    try {
      const res = await fetch(`/api/admin/buildrootz/community-requests/${state.selectedCommunityId}/status`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) {
        if (els.requestStatusText) els.requestStatusText.textContent = data?.error || 'Error';
        return;
      }
      await refreshCommunities();
      const updated = findCommunity(state.selectedCommunityId);
      renderCommunityCard(updated);
      updateRequestUI(updated);
      if (data.communityId) {
        setMappingState(true);
        setSearchStatus('Approved and mapped.', 'muted');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const mapCommunity = async () => {
    if (!state.selectedCommunityId || !state.selectedBrId || state.saving) return;
    state.saving = true;
    if (els.mapBtn) els.mapBtn.disabled = true;
    if (els.unmapBtn) els.unmapBtn.disabled = true;
    setSearchStatus('Mapping community...', 'muted');
    try {
      const res = await fetch(`/api/admin/buildrootz/communities/${state.selectedCommunityId}/map`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ buildrootzCommunityId: state.selectedBrId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Map failed (${res.status})`);
      await refreshCommunities();
      state.selectedBrId = '';
      const updated = findCommunity(state.selectedCommunityId);
      renderCommunityCard(updated);
      setMappingState(true);
      setSearchStatus('Mapped successfully.', 'muted');
    } catch (err) {
      console.error(err);
      setSearchStatus(err.message || 'Map failed.', 'danger');
    } finally {
      state.saving = false;
      if (els.mapBtn) els.mapBtn.disabled = false;
      if (els.unmapBtn) els.unmapBtn.disabled = false;
    }
  };

  const unmapCommunity = async () => {
    if (!state.selectedCommunityId || state.saving) return;
    state.saving = true;
    if (els.unmapBtn) els.unmapBtn.disabled = true;
    setSearchStatus('Removing mapping...', 'muted');
    try {
      const res = await fetch(`/api/admin/buildrootz/communities/${state.selectedCommunityId}/map`, {
        method: 'DELETE',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Unmap failed (${res.status})`);
      await refreshCommunities();
      const updated = findCommunity(state.selectedCommunityId);
      renderCommunityCard(updated);
      setMappingState(false);
      setSearchStatus('Mapping removed. Search to map again.', 'muted');
      state.selectedBrId = '';
      state.searchResults = [];
      renderResults();
    } catch (err) {
      console.error(err);
      setSearchStatus(err.message || 'Unmap failed.', 'danger');
    } finally {
      state.saving = false;
      if (els.unmapBtn) els.unmapBtn.disabled = false;
    }
  };

  const handleSearchInput = (event) => {
    const value = event.target.value || '';
    state.selectedBrId = '';
    if (els.mapBtn) els.mapBtn.disabled = true;
    if (!state.selectedCommunityId) {
      setSearchStatus('Choose a community to start.');
      return;
    }
    if (!value.trim()) {
      state.searchResults = [];
      renderResults();
      setSearchStatus('Start typing to search canonical BuildRootz communities.');
      return;
    }
    setSearchStatus('Searching…');
    if (state.searchTimer) clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => performSearch(value.trim()), 400);
  };

  if (els.select) {
    els.select.addEventListener('change', handleSelectCommunity);
  }
  if (els.searchInput) {
    els.searchInput.addEventListener('input', handleSearchInput);
  }
  if (els.mapBtn) {
    els.mapBtn.addEventListener('click', mapCommunity);
  }
  if (els.unmapBtn) {
    els.unmapBtn.addEventListener('click', unmapCommunity);
  }
  if (els.requestBtn) {
    els.requestBtn.addEventListener('click', () => {
      if (!els.requestForm) return;
      const isHidden = els.requestForm.classList.contains('d-none');
      if (isHidden) {
        els.requestForm.classList.remove('d-none');
      } else {
        els.requestForm.classList.add('d-none');
      }
    });
  }
  if (els.reqCancel) {
    els.reqCancel.addEventListener('click', (e) => {
      e.preventDefault();
      if (els.requestForm) els.requestForm.classList.add('d-none');
    });
  }
  if (els.requestForm) {
    els.requestForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitRequest();
    });
  }
  if (els.checkStatusBtn) {
    els.checkStatusBtn.addEventListener('click', (e) => {
      e.preventDefault();
      checkRequestStatus();
    });
  }

  // Initial render
  handleSelectCommunity();
})();
