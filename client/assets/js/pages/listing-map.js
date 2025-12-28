document.addEventListener('DOMContentLoaded', () => {
  const communitySelect = document.getElementById('lm-community');
  const dropzone = document.getElementById('lm-dropzone');
  const fileInput = document.getElementById('lm-file-input');
  const fileNameEl = document.getElementById('lm-file-name');
  const uploadBtn = document.getElementById('lm-upload-btn');
  const statusEl = document.getElementById('lm-status');
  const mapRoot = document.getElementById('map-root');
  const zoomInBtn = document.getElementById('lm-zoom-in');
  const zoomOutBtn = document.getElementById('lm-zoom-out');
  const zoomResetBtn = document.getElementById('lm-zoom-reset');

  const setStatus = (text) => {
    if (statusEl) statusEl.textContent = text;
  };

  const setFile = (fileOrFiles) => {
    const files = Array.isArray(fileOrFiles)
      ? fileOrFiles
      : fileOrFiles
      ? [fileOrFiles]
      : [];
    if (!files.length) {
      if (fileNameEl) fileNameEl.textContent = 'No file selected';
      if (fileInput) fileInput.value = '';
      if (uploadBtn) uploadBtn.disabled = true;
      return;
    }
    const label = files.length === 1
      ? `${files[0].name} (${(files[0].size / 1024).toFixed(1)} KB)`
      : `${files.length} files selected`;
    if (fileNameEl) fileNameEl.textContent = label;
    if (uploadBtn) uploadBtn.disabled = false;
    if (fileInput && 'DataTransfer' in window) {
      try {
        const dt = new DataTransfer();
        files.forEach((f) => dt.items.add(f));
        fileInput.files = dt.files;
      } catch (_) {
        // ignore
      }
    }
  };

  const loadCommunities = async () => {
    try {
      const res = await fetch('/api/communities');
      if (!res.ok) throw new Error('Failed to load communities');
      const items = await res.json();
      const list = Array.isArray(items) ? items : [];
      if (!communitySelect) return;
      if (!list.length) {
        communitySelect.innerHTML = '<option value="">No communities available</option>';
        communitySelect.disabled = true;
        return;
      }
      communitySelect.innerHTML = list
        .map((c) => `<option value="${c._id}">${c.name || 'Community'}</option>`)
        .join('');
      loadManifest(communitySelect.value);
    } catch (err) {
      console.error(err);
      if (communitySelect) {
        communitySelect.innerHTML = '<option value="">Error loading communities</option>';
        communitySelect.disabled = true;
      }
    }
  };

  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput?.click();
    }
  });
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((evt) => {
    dropzone?.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone?.addEventListener(evt, () => dropzone.classList.add('drag'), false);
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone?.addEventListener(evt, () => dropzone.classList.remove('drag'), false);
  });
  dropzone?.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    setFile(files);
  });
  fileInput?.addEventListener('change', () => {
    const files = fileInput.files ? Array.from(fileInput.files) : [];
    setFile(files);
  });

  uploadBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    setStatus('Upload placeholder (not wired yet)');
  });

  async function loadManifest(communityId) {
    if (!communityId) {
      setStatus('Select a community');
      if (mapRoot) {
        mapRoot.dataset.overlaySrc = '';
        mapRoot.dataset.combinedSrc = '';
        mapRoot.dataset.linksSrc = '';
      }
      return;
    }
    try {
      const res = await fetch(`/api/communities/${communityId}/map`);
      if (!res.ok) {
        setStatus('No map uploaded');
        if (mapRoot) {
          mapRoot.dataset.overlaySrc = '';
          mapRoot.dataset.combinedSrc = '';
          mapRoot.dataset.linksSrc = '';
        }
        return;
      }
      const data = await res.json();
      const paths = data?.paths || {};
      if (mapRoot && (paths.overlayPath || paths.combinedPath)) {
        mapRoot.dataset.overlaySrc = paths.overlayPath || '';
        mapRoot.dataset.combinedSrc = paths.combinedPath || paths.overlayPath || '';
        mapRoot.dataset.linksSrc = paths.linksPath || '';
        window.renderLotMap && window.renderLotMap(mapRoot);
        setStatus('Map loaded');
      } else {
        setStatus('No map uploaded');
      }
    } catch (err) {
      console.error(err);
      setStatus('Failed to load map');
    }
  }

  communitySelect?.addEventListener('change', () => {
    const id = communitySelect.value || '';
    loadManifest(id);
  });

  uploadBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const communityId = communitySelect?.value || '';
    if (!communityId) {
      alert('Select a community first.');
      return;
    }
    const files = fileInput?.files ? Array.from(fileInput.files) : [];
    if (!files.length) {
      alert('Choose overlay/links files first.');
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file, file.name));

    uploadBtn.disabled = true;
    const prev = uploadBtn.textContent;
    uploadBtn.textContent = 'Uploading...';
    setStatus('Uploading map...');

    try {
      const res = await fetch(`/api/communities/${communityId}/map`, {
        method: 'POST',
        body: formData
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || `Upload failed (${res.status})`);
      setStatus('Upload complete');
      setFile(null);
      await loadManifest(communityId);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Upload failed');
      setStatus('Upload failed');
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = prev;
    }
  });

  const applyZoom = (val) => {
    if (!mapRoot || !window.applyLotMapZoom) return;
    window.applyLotMapZoom(mapRoot, val);
    mapRoot.dataset.zoom = val;
  };

  zoomInBtn?.addEventListener('click', () => {
    const current = parseFloat(mapRoot?.dataset?.zoom || '1') || 1;
    applyZoom(current + 0.2);
  });
  zoomOutBtn?.addEventListener('click', () => {
    const current = parseFloat(mapRoot?.dataset?.zoom || '1') || 1;
    applyZoom(current - 0.2);
  });
  zoomResetBtn?.addEventListener('click', () => applyZoom(1));

  loadCommunities();
});
