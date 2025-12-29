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
  const panelTabs = document.querySelectorAll('[data-panel-tab]');
  const panelDetails = document.getElementById('map-panel-details');
  const panelTools = document.getElementById('map-panel-tools');
  const panelTitle = document.getElementById('map-panel-title');
  const planToolsList = document.getElementById('plan-tools-list');

  const paletteStyleId = 'plan-palette-style';

  const cssColorToHex = (color) => {
    if (!color) return '#cccccc';
    const trimmed = color.trim();
    if (trimmed.startsWith('#') && (trimmed.length === 7 || trimmed.length === 4)) return trimmed;
    const match = trimmed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (match) {
      const [, r, g, b] = match.map((v) => Number(v));
      const toHex = (n) => n.toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
    return '#cccccc';
  };

  const loadPalette = (communityId) => {
    const key = `lm-plan-palette:${communityId || 'default'}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  };

  const savePalette = (communityId, palette) => {
    const key = `lm-plan-palette:${communityId || 'default'}`;
    try {
      localStorage.setItem(key, JSON.stringify(palette || {}));
    } catch (_) {
      // ignore storage issues
    }
  };

  const applyPalette = (root, palette) => {
    if (!root) return;
    const entries = Object.entries(palette || {}).filter(([, color]) => Boolean(color));
    let styleTag = document.getElementById(paletteStyleId);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = paletteStyleId;
      document.head.appendChild(styleTag);
    }
    if (!entries.length) {
      styleTag.textContent = '';
      return;
    }
    const css = entries
      .map(([cls, color]) => `.map-overlay-layer path.${cls} { fill: ${color} !important; }`)
      .join('\n');
    styleTag.textContent = css;
  };

  const collectPlanClasses = (root) => {
    if (!root) return [];
    const overlay = root.querySelector('#overlay');
    if (!overlay) return [];
    const paths = Array.from(overlay.querySelectorAll('path'));
    const map = new Map();
    paths.forEach((path) => {
      const planClass = Array.from(path.classList).find((cls) => cls.startsWith('plan-'));
      if (!planClass) return;
      if (map.has(planClass)) return;
      const fill = window.getComputedStyle(path).fill;
      map.set(planClass, {
        className: planClass,
        label: planClass.replace(/^plan-/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        fill: cssColorToHex(fill)
      });
    });
    return Array.from(map.values());
  };

  const renderPlanTools = (root, meta = []) => {
    if (!planToolsList || !root) return;
    const communityId = root.dataset.communityId || 'default';
    const palette = loadPalette(communityId);
    const metaByClass = new Map(
      (meta || []).map((entry) => [entry.className, entry])
    );
    const classes = collectPlanClasses(root);
    if (!classes.length && !meta.length) {
      planToolsList.textContent = 'No plan classes detected yet.';
      return;
    }
    const combined = classes.map((entry) => {
      const m = metaByClass.get(entry.className);
      return {
        ...entry,
        label: (m?.label || entry.label || entry.className),
        planNumber: m?.planNumber || ''
      };
    });
    planToolsList.innerHTML = '';
    combined.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'map-tool-row';

      const label = document.createElement('div');
      label.className = 'map-tool-label';
      label.innerHTML = `<span>${entry.label}</span><code>${entry.planNumber || entry.className}</code>`;

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'form-control form-control-color form-control-sm';
      colorInput.value = palette[entry.className] || entry.fill || '#cccccc';
      colorInput.setAttribute('aria-label', `Color for ${entry.label}`);

      colorInput.addEventListener('input', () => {
        palette[entry.className] = colorInput.value;
        applyPalette(root, palette);
        savePalette(communityId, palette);
      });

      row.appendChild(label);
      row.appendChild(colorInput);
      planToolsList.appendChild(row);
    });
    applyPalette(root, palette);
  };

  const showPanel = (name) => {
    const isDetails = name === 'details';
    panelTabs.forEach((btn) => {
      const isActive = btn.dataset.panelTab === name;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('btn-primary', isActive);
      btn.classList.toggle('btn-outline-secondary', !isActive);
    });
    if (panelDetails) panelDetails.classList.toggle('visually-hidden', !isDetails);
    if (panelTools) panelTools.classList.toggle('visually-hidden', isDetails);
    if (panelTitle) panelTitle.textContent = isDetails ? 'Selection' : 'Tools';
  };

  panelTabs.forEach((btn) => {
    btn.addEventListener('click', () => showPanel(btn.dataset.panelTab || 'details'));
  });
  showPanel('details');

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

  async function loadManifest(communityId) {
    if (!communityId) {
      setStatus('Select a community');
      if (mapRoot) {
        mapRoot.dataset.overlaySrc = '';
        mapRoot.dataset.combinedSrc = '';
        mapRoot.dataset.linksSrc = '';
        mapRoot.dataset.communityId = '';
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
          mapRoot.dataset.communityId = communityId;
        }
        return;
      }
      const data = await res.json();
      const paths = data?.paths || {};
      if (mapRoot && (paths.overlayPath || paths.combinedPath)) {
        mapRoot.dataset.overlaySrc = paths.overlayPath || '';
        mapRoot.dataset.combinedSrc = paths.combinedPath || paths.overlayPath || '';
        mapRoot.dataset.linksSrc = paths.linksPath || '';
        mapRoot.dataset.communityId = communityId;
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

  mapRoot?.addEventListener('lotmap:ready', (evt) => {
    const meta = evt?.detail?.planMeta || [];
    renderPlanTools(mapRoot, meta);
    showPanel('details');
  });

  loadCommunities();
});
