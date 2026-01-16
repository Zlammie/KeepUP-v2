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
  const salesScopeSelect = document.getElementById('lm-sales-scope');
  const filesListEl = document.getElementById('lm-files-list');

  const paletteStyleId = 'plan-palette-style';
  const paletteCache = new Map();
  let paletteSaveTimer = null;
  const PALETTE_SAVE_DELAY = 400;
  const SALES_SCOPE_VALUES = new Set(['active', 'both', 'none']);
  let allowedPlanClasses = null;

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

  const normalizeSalesScope = (value) => {
    const scope = String(value || '').trim().toLowerCase();
    return SALES_SCOPE_VALUES.has(scope) ? scope : 'active';
  };

  const getSalesScopeKey = (communityId) => `lm-sales-scope:${communityId || 'default'}`;

  const loadSalesScope = (communityId) => {
    const key = getSalesScopeKey(communityId);
    try {
      const raw = localStorage.getItem(key);
      return normalizeSalesScope(raw || 'active');
    } catch (_) {
      return 'active';
    }
  };

  const saveSalesScope = (communityId, scope) => {
    const key = getSalesScopeKey(communityId);
    try {
      localStorage.setItem(key, normalizeSalesScope(scope));
    } catch (_) {
      // ignore storage issues
    }
  };

  const applySalesScope = (scope) => {
    const normalized = normalizeSalesScope(scope);
    if (mapRoot) mapRoot.dataset.salesInfoScope = normalized;
    if (salesScopeSelect) salesScopeSelect.value = normalized;
  };

  const loadPalette = (communityId) => {
    const key = `lm-plan-palette:${communityId || 'default'}`;
    if (paletteCache.has(key)) return paletteCache.get(key);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const normalized = parsed && typeof parsed === 'object' ? parsed : {};
      paletteCache.set(key, normalized);
      return normalized;
    } catch (_) {
      return {};
    }
  };

  const savePalette = (communityId, palette, options = {}) => {
    const key = `lm-plan-palette:${communityId || 'default'}`;
    const normalized = palette && typeof palette === 'object' ? palette : {};
    try {
      paletteCache.set(key, normalized);
      localStorage.setItem(key, JSON.stringify(normalized || {}));
    } catch (_) {
      // ignore storage issues
    }
    if (options.persist !== false) schedulePaletteSave(communityId, normalized);
  };

  const isHexColor = (value) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || '').trim());

  const normalizePalette = (input) => {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    Object.entries(input).forEach(([key, value]) => {
      const trimmedKey = String(key || '').trim();
      if (!trimmedKey.startsWith('plan-')) return;
      const trimmedValue = String(value || '').trim().toLowerCase();
      if (!isHexColor(trimmedValue)) return;
      out[trimmedKey] = trimmedValue;
    });
    return out;
  };

  const normalizePlanKey = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    return raw
      .replace(/^floor\s*plan\s*/i, '')
      .replace(/^plan\s*/i, '')
      .replace(/^#/, '')
      .trim();
  };

  const toPlanClass = (value) => {
    const key = normalizePlanKey(value);
    if (!key) return '';
    const safe = key.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
    return safe ? `plan-${safe}` : '';
  };

  const buildAllowedPlanClasses = (plans) => {
    const set = new Set();
    (plans || []).forEach((plan) => {
      const nameClass = toPlanClass(plan?.name);
      const numberClass = toPlanClass(plan?.planNumber);
      if (nameClass) set.add(nameClass);
      if (numberClass) set.add(numberClass);
    });
    return set;
  };

  const loadCommunityPlans = async (communityId) => {
    if (!communityId) return new Set();
    try {
      const res = await fetch(`/api/communities/${communityId}/floorplans`);
      if (!res.ok) return new Set();
      const data = await res.json();
      const plans = Array.isArray(data) ? data : [];
      return buildAllowedPlanClasses(plans);
    } catch (err) {
      console.warn('Failed to load community floor plans', err);
      return new Set();
    }
  };

  const fetchPalette = async (communityId) => {
    if (!communityId) return {};
    try {
      const res = await fetch(`/api/communities/${communityId}/plan-palette`);
      if (!res.ok) return {};
      const data = await res.json();
      return normalizePalette(data?.planPalette || {});
    } catch (err) {
      console.warn('Failed to load plan palette', err);
      return {};
    }
  };

  const savePaletteToServer = async (communityId, palette) => {
    if (!communityId) return;
    try {
      await fetch(`/api/communities/${communityId}/plan-palette`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planPalette: normalizePalette(palette) })
      });
    } catch (err) {
      console.warn('Failed to save plan palette', err);
    }
  };

  const schedulePaletteSave = (communityId, palette) => {
    if (!communityId) return;
    if (paletteSaveTimer) clearTimeout(paletteSaveTimer);
    paletteSaveTimer = setTimeout(() => {
      savePaletteToServer(communityId, palette);
    }, PALETTE_SAVE_DELAY);
  };

  const preloadPalette = async (communityId) => {
    if (!communityId) return {};
    const localPalette = loadPalette(communityId);
    const remotePalette = await fetchPalette(communityId);
    if (Object.keys(remotePalette).length) {
      savePalette(communityId, remotePalette, { persist: false });
      return remotePalette;
    }
    if (Object.keys(localPalette).length) {
      schedulePaletteSave(communityId, localPalette);
      return localPalette;
    }
    return {};
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

  const buildFileEntries = (manifest) => {
    const files = manifest?.files || {};
    const entries = [];
    const overlays = Array.isArray(files.overlays) && files.overlays.length
      ? files.overlays
      : (files.overlay ? [files.overlay] : []);
    overlays.forEach((file, index) => {
      entries.push({
        file,
        kind: overlays.length > 1 ? `Overlay SVG ${index + 1}` : 'Overlay SVG'
      });
    });
    if (files.links) entries.push({ file: files.links, kind: 'Links JSON' });
    if (files.background) entries.push({ file: files.background, kind: 'Background Image' });
    return entries;
  };

  const renderFilesList = (manifest, communityId) => {
    if (!filesListEl) return;
    const entries = buildFileEntries(manifest);
    if (!entries.length) {
      filesListEl.textContent = 'No files uploaded.';
      return;
    }
    filesListEl.innerHTML = '';
    entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'lm-file-row';

      const meta = document.createElement('div');
      meta.className = 'lm-file-meta';

      const name = document.createElement('div');
      name.className = 'lm-file-name';
      name.textContent = entry.file;

      const kind = document.createElement('div');
      kind.className = 'lm-file-kind';
      kind.textContent = entry.kind;

      meta.appendChild(name);
      meta.appendChild(kind);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-outline-danger btn-sm';
      button.textContent = 'Delete';
      button.addEventListener('click', async () => {
        if (!communityId) return;
        const ok = window.confirm(`Delete ${entry.file}? This cannot be undone.`);
        if (!ok) return;
        button.disabled = true;
        try {
          const res = await fetch(`/api/communities/${communityId}/map/files/${encodeURIComponent(entry.file)}`, {
            method: 'DELETE'
          });
          const text = await res.text();
          if (!res.ok) throw new Error(text || 'Delete failed');
          await loadManifest(communityId);
        } catch (err) {
          console.error(err);
          alert(err.message || 'Delete failed');
        } finally {
          button.disabled = false;
        }
      });

      row.appendChild(meta);
      row.appendChild(button);
      filesListEl.appendChild(row);
    });
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
    let combined = classes.map((entry) => {
      const m = metaByClass.get(entry.className);
      return {
        ...entry,
        label: (m?.label || entry.label || entry.className),
        planNumber: m?.planNumber || ''
      };
    });
    if (allowedPlanClasses instanceof Set) {
      if (!allowedPlanClasses.size) {
        planToolsList.textContent = 'No linked floor plans for this community.';
        return;
      }
      combined = combined.filter((entry) => allowedPlanClasses.has(entry.className));
    }
    if (!combined.length) {
      planToolsList.textContent = 'No linked floor plans detected on this map.';
      return;
    }
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
      allowedPlanClasses = null;
      if (mapRoot) {
        mapRoot.dataset.overlaySrc = '';
        mapRoot.dataset.combinedSrc = '';
        mapRoot.dataset.linksSrc = '';
        mapRoot.dataset.communityId = '';
        mapRoot.dataset.activeProductId = '';
        mapRoot.dataset.activeProductType = '';
        applySalesScope(loadSalesScope(''));
      }
      return;
    }
    try {
      const res = await fetch(`/api/communities/${communityId}/map`);
      if (!res.ok) {
        setStatus('No map uploaded');
        renderFilesList(null, communityId);
        allowedPlanClasses = await loadCommunityPlans(communityId);
        if (mapRoot) {
          mapRoot.dataset.overlaySrc = '';
          mapRoot.dataset.combinedSrc = '';
          mapRoot.dataset.linksSrc = '';
          mapRoot.dataset.communityId = communityId;
          mapRoot.dataset.activeProductId = communityId;
          mapRoot.dataset.activeProductType = 'community';
          applySalesScope(loadSalesScope(communityId));
        }
        return;
      }
      const data = await res.json();
      renderFilesList(data, communityId);
      allowedPlanClasses = await loadCommunityPlans(communityId);
      const paths = data?.paths || {};
      if (mapRoot && (paths.overlayPath || paths.combinedPath)) {
        mapRoot.dataset.overlaySrc = paths.overlayPath || '';
        mapRoot.dataset.combinedSrc = paths.combinedPath || paths.overlayPath || '';
        mapRoot.dataset.linksSrc = paths.linksPath || '';
        mapRoot.dataset.communityId = communityId;
        mapRoot.dataset.activeProductId = communityId;
        mapRoot.dataset.activeProductType = 'community';
        applySalesScope(loadSalesScope(communityId));
        await preloadPalette(communityId);
        window.renderLotMap && window.renderLotMap(mapRoot);
        setStatus('Map loaded');
      } else {
        setStatus('No map uploaded');
      }
    } catch (err) {
      console.error(err);
      setStatus('Failed to load map');
      allowedPlanClasses = null;
      renderFilesList(null, communityId);
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

  salesScopeSelect?.addEventListener('change', () => {
    const communityId = mapRoot?.dataset?.communityId || '';
    const scope = normalizeSalesScope(salesScopeSelect.value);
    applySalesScope(scope);
    saveSalesScope(communityId, scope);
    window.renderLotMap && window.renderLotMap(mapRoot);
  });

  mapRoot?.addEventListener('lotmap:ready', (evt) => {
    const meta = evt?.detail?.planMeta || [];
    renderPlanTools(mapRoot, meta);
    showPanel('details');
  });

  loadCommunities();
});
