(() => {
  const root = document.getElementById('embed-group-root');
  const statusEl = document.getElementById('embed-status');
  const communityNameEl = document.getElementById('embed-community-name');
  const overlayEl = document.getElementById('map-overlay');
  const bgImg = document.getElementById('map-bg');
  const stageEl = document.getElementById('map-stage');
  const filtersEl = document.getElementById('layer-filters');
  const emptyMessageEl = document.getElementById('map-empty-message');
  const styleToggleEl = document.getElementById('map-style-toggle');
  const styleNonce = root?.dataset?.cspNonce || '';

  const lotTitle = document.getElementById('lot-title');
  const lotStatus = document.getElementById('lot-status');
  const lotAddress = document.getElementById('lot-address');
  const lotLabel = document.getElementById('lot-label');
  const lotPlan = document.getElementById('lot-plan');
  const lotSqft = document.getElementById('lot-sqft');
  const lotBeds = document.getElementById('lot-beds');
  const lotBaths = document.getElementById('lot-baths');
  const lotGarage = document.getElementById('lot-garage');
  const lotPrice = document.getElementById('lot-price');
  const lotPriceField = document.getElementById('lot-price-field');
  const lotEmpty = document.getElementById('lot-empty');
  const lotDetails = document.getElementById('lot-details');
  const lotLink = document.getElementById('lot-link');

  let activeShape = null;
  let styleMode = 'status';
  const layerShapes = new Map();
  const layerMeta = new Map();
  const activeLayers = new Set();
  const lotIndex = new Map();
  const planClasses = new Set();
  const paletteStyleId = 'embed-group-plan-palette-style';
  let planPalette = {};

  const PLAN_PALETTE = [
    '#2f9e44',
    '#228be6',
    '#f59f00',
    '#a855f7',
    '#f97316',
    '#0ea5e9',
    '#84cc16',
    '#64748b',
    '#14b8a6',
    '#f43f5e'
  ];

  const setStatus = (text, state) => {
    if (statusEl) statusEl.textContent = text;
    if (!statusEl) return;
    if (state) statusEl.dataset.state = state;
    else delete statusEl.dataset.state;
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

  const loadLocalPalette = (communityId) => {
    if (!communityId) return {};
    const key = `lm-plan-palette:${communityId}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      return normalizePalette(JSON.parse(raw));
    } catch (_) {
      return {};
    }
  };

  const mergePalette = (target, source) => {
    if (!target || !source) return;
    Object.entries(source).forEach(([key, value]) => {
      if (!key || target[key]) return;
      target[key] = value;
    });
  };

  const formatTitle = (slug) => {
    const safe = String(slug || '').trim();
    if (!safe) return 'Community map';
    return safe
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const getGroupSlug = () => {
    const fromData = root?.dataset?.group || '';
    if (fromData) return fromData;
    const parts = window.location.pathname.split('/').filter(Boolean);
    const mapIndex = parts.indexOf('map-group');
    if (mapIndex > -1 && parts[mapIndex + 1]) return parts[mapIndex + 1];
    return '';
  };

  const normalizeStatus = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('avail')) return 'available';
    if (raw.includes('sold')) return 'sold';
    if (raw.includes('closed')) return 'closed';
    if (raw.includes('hold')) return 'hold';
    if (raw.includes('model')) return 'model';
    if (raw.includes('spec')) return 'spec';
    if (raw.includes('coming')) return 'coming-soon';
    return '';
  };

  const isSoldLike = (value) => {
    const norm = normalizeStatus(value);
    return norm === 'sold' || norm === 'closed';
  };

  const shouldShowPrice = (value) => {
    const norm = normalizeStatus(value);
    return norm === 'available' || norm === 'spec';
  };

  const formatStatus = (value) => {
    const text = String(value || '').trim();
    return text || 'Unknown';
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

  const buildPlanClassCandidates = (...values) => (
    values
      .map((value) => toPlanClass(value))
      .filter(Boolean)
  );

  const pickPlanClass = (planName, planNumber) => {
    const candidates = buildPlanClassCandidates(planName, planNumber);
    if (!candidates.length) return '';
    const matched = candidates.find((cls) => planPalette[cls]);
    return matched || candidates[0];
  };

  const hashString = (value) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const applyPlanPalette = () => {
    let styleTag = document.getElementById(paletteStyleId);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = paletteStyleId;
      if (styleNonce) styleTag.setAttribute('nonce', styleNonce);
      document.head.appendChild(styleTag);
    } else if (styleNonce && !styleTag.getAttribute('nonce')) {
      styleTag.setAttribute('nonce', styleNonce);
    }
    const classes = Array.from(planClasses);
    const css = classes
      .map((cls) => {
        const color = planPalette[cls] || PLAN_PALETTE[hashString(cls) % PLAN_PALETTE.length];
        return [
          `.embed-style-plan .map-overlay path.${cls} { fill: ${color} !important; }`,
          `.embed-style-plan .map-overlay polygon.${cls} { fill: ${color} !important; }`,
          `.embed-style-plan .map-overlay rect.${cls} { fill: ${color} !important; }`
        ].join('\n');
      })
      .join('\n');
    const dimOverride = [
      '.embed-style-plan .map-overlay path.lot-dim,',
      '.embed-style-plan .map-overlay polygon.lot-dim,',
      '.embed-style-plan .map-overlay rect.lot-dim {',
      '  fill: #e5e7eb !important;',
      '  stroke: #f3f4f6 !important;',
      '  filter: none !important;',
      '}',
      '.embed-style-plan .map-overlay path.lot-dim.lot-sold,',
      '.embed-style-plan .map-overlay polygon.lot-dim.lot-sold,',
      '.embed-style-plan .map-overlay rect.lot-dim.lot-sold {',
      '  stroke-width: 1 !important;',
      '  filter: none !important;',
      '}',
      '.embed-style-plan .map-overlay path.lot-dim.lot-selected,',
      '.embed-style-plan .map-overlay polygon.lot-dim.lot-selected,',
      '.embed-style-plan .map-overlay rect.lot-dim.lot-selected {',
      '  stroke-width: 1 !important;',
      '  filter: none !important;',
      '}'
    ].join('\n');
    if (!classes.length) {
      styleTag.textContent = dimOverride;
      return;
    }
    styleTag.textContent = `${css}\n${dimOverride}`;
  };

  const applyStyleMode = (mode) => {
    styleMode = mode === 'plan' ? 'plan' : 'status';
    root?.classList.toggle('embed-style-plan', styleMode === 'plan');
    root?.classList.toggle('embed-style-status', styleMode === 'status');
    if (!styleToggleEl) return;
    const buttons = styleToggleEl.querySelectorAll('[data-style]');
    buttons.forEach((btn) => {
      const isActive = btn.dataset.style === styleMode;
      btn.classList.toggle('is-active', isActive);
    });
  };

  const formatNumber = (value) => (
    Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value) : '-'
  );

  const formatCurrency = (value) => (
    Number.isFinite(value)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
      : '-'
  );

  const showEmptyPanel = (title = 'Select a lot') => {
    if (lotTitle) lotTitle.textContent = title;
    if (lotStatus) lotStatus.textContent = 'Status: -';
    if (lotAddress) lotAddress.textContent = '-';
    if (lotLabel) lotLabel.textContent = '-';
    if (lotPlan) lotPlan.textContent = '-';
    if (lotSqft) lotSqft.textContent = '-';
    if (lotBeds) lotBeds.textContent = '-';
    if (lotBaths) lotBaths.textContent = '-';
    if (lotGarage) lotGarage.textContent = '-';
    if (lotPrice) lotPrice.textContent = '-';
    if (lotPriceField) lotPriceField.classList.remove('is-hidden');
    if (lotEmpty) lotEmpty.classList.remove('is-hidden');
    if (lotDetails) lotDetails.classList.add('is-hidden');
    if (lotLink) lotLink.classList.add('is-hidden');
  };

  const renderLotPanel = (entry) => {
    if (!entry) {
      showEmptyPanel('No lot selected');
      return;
    }
    const labelText = entry.label ? `Lot ${entry.label}` : (entry.address || 'Selected lot');
    const statusText = formatStatus(entry.status);
    const layerText = entry.layerLabel ? ` - ${entry.layerLabel}` : '';
    if (lotTitle) lotTitle.textContent = labelText;
    if (lotStatus) lotStatus.textContent = `Status: ${statusText}${layerText}`;
    if (lotAddress) lotAddress.textContent = entry.address || '-';
    if (lotLabel) lotLabel.textContent = entry.label ? `Lot ${entry.label}` : '-';
    if (lotPlan) {
      const plan = entry.floorPlanName || entry.floorPlanNumber || '';
      lotPlan.textContent = plan || '-';
    }
    if (lotSqft) lotSqft.textContent = formatNumber(entry.squareFeet);
    if (lotBeds) lotBeds.textContent = formatNumber(entry.beds);
    if (lotBaths) lotBaths.textContent = formatNumber(entry.baths);
    if (lotGarage) lotGarage.textContent = formatNumber(entry.garage);
    if (lotPrice) lotPrice.textContent = formatCurrency(entry.price);
    if (lotPriceField) {
      const showPrice = shouldShowPrice(entry.status);
      lotPriceField.classList.toggle('is-hidden', !showPrice);
    }
    if (lotEmpty) lotEmpty.classList.add('is-hidden');
    if (lotDetails) lotDetails.classList.remove('is-hidden');

    if (lotLink) {
      if (entry.listingUrl) {
        lotLink.href = entry.listingUrl;
        lotLink.classList.remove('is-hidden');
      } else {
        lotLink.classList.add('is-hidden');
      }
    }
  };

  const normalizeSvgViewport = (svgEl) => {
    if (!svgEl) return;
    const parseNumber = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };
    const viewBox = (() => {
      const raw = svgEl.getAttribute('viewBox');
      if (!raw) return null;
      const parts = raw.trim().split(/\s+/).map(parseNumber);
      return parts.length === 4 ? { width: parts[2], height: parts[3] } : null;
    })();
    const baseWidth = parseNumber(svgEl.getAttribute('width'));
    const baseHeight = parseNumber(svgEl.getAttribute('height'));
    const bbox = (() => {
      try { return svgEl.getBBox(); } catch (_) { return null; }
    })();
    const bboxWidth = bbox?.width || 0;
    const bboxHeight = bbox?.height || 0;
    const targetWidth = Math.max(viewBox?.width || 0, baseWidth, bboxWidth);
    const targetHeight = Math.max(viewBox?.height || 0, baseHeight, bboxHeight);
    if (targetWidth > 0 && targetHeight > 0) {
      if (!viewBox || targetWidth !== viewBox.width || targetHeight !== viewBox.height) {
        svgEl.setAttribute('viewBox', `0 0 ${targetWidth} ${targetHeight}`);
      }
      svgEl.removeAttribute('width');
      svgEl.removeAttribute('height');
    }
  };

  const buildLotIndex = (layers) => {
    layers.forEach((layer) => {
      layerMeta.set(layer.key, layer.label || layer.key);
      const lotsById = layer.lotsById || {};
      Object.entries(lotsById).forEach(([regionId, data]) => {
        if (!regionId) return;
        if (lotIndex.has(regionId)) return;
        lotIndex.set(regionId, {
          ...data,
          layerKey: layer.key,
          layerLabel: layer.label || layer.key
        });
      });
    });
  };

  const renderFilters = (layers) => {
    if (!filtersEl) return;
    filtersEl.innerHTML = '';
    layers.forEach((layer) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'layer-toggle';
      button.textContent = layer.label || layer.key;
      button.dataset.layerKey = layer.key;
      button.setAttribute('aria-pressed', 'true');
      button.addEventListener('click', () => {
        const key = layer.key;
        if (activeLayers.has(key)) activeLayers.delete(key);
        else activeLayers.add(key);
        button.classList.toggle('is-off', !activeLayers.has(key));
        button.setAttribute('aria-pressed', activeLayers.has(key) ? 'true' : 'false');
        applyLayerVisibility();
      });
      filtersEl.appendChild(button);
    });
  };

  const applyLayerVisibility = () => {
    layerShapes.forEach((shapes, key) => {
      const visible = activeLayers.has(key);
      shapes.forEach((shape) => {
        shape.classList.toggle('lot-dim', !visible);
      });
    });

    const hasActive = activeLayers.size > 0;
    if (emptyMessageEl) emptyMessageEl.classList.toggle('is-hidden', hasActive);
    if (!hasActive) {
      if (activeShape) activeShape.classList.remove('lot-selected');
      activeShape = null;
      showEmptyPanel('Turn on a product to view homesites.');
      return;
    }

    if (!activeShape) {
      showEmptyPanel('Select a lot');
      return;
    }

    const layerKey = activeShape.dataset.layer;
    if (layerKey && !activeLayers.has(layerKey)) {
      activeShape.classList.remove('lot-selected');
      activeShape = null;
      showEmptyPanel('Select a lot');
    }
  };

  const bindOverlay = (svgText) => {
    if (!overlayEl) return;
    overlayEl.innerHTML = svgText;
    const svgEl = overlayEl.querySelector('svg');
    if (!svgEl) throw new Error('Overlay missing <svg>');
    normalizeSvgViewport(svgEl);

    const shapes = svgEl.querySelectorAll('path[id], polygon[id], rect[id]');
    shapes.forEach((shape) => {
      const regionId = shape.id;
      const entry = lotIndex.get(regionId);
      if (!entry) {
        shape.classList.add('lot-unassigned');
        return;
      }

      shape.classList.add('lot-linked');
      shape.dataset.layer = entry.layerKey;
      const statusClass = normalizeStatus(entry.status);
      if (statusClass) shape.classList.add(`lot-status-${statusClass}`);
      if (isSoldLike(entry.status)) shape.classList.add('lot-sold');

      const planClass = pickPlanClass(entry.floorPlanName, entry.floorPlanNumber);
      if (planClass) {
        shape.classList.add(planClass);
        planClasses.add(planClass);
      }

      if (!layerShapes.has(entry.layerKey)) layerShapes.set(entry.layerKey, []);
      layerShapes.get(entry.layerKey).push(shape);

      shape.addEventListener('click', (event) => {
        event.preventDefault();
        if (!activeLayers.has(entry.layerKey)) return;
        if (activeShape && activeShape !== shape) activeShape.classList.remove('lot-selected');
        activeShape = shape;
        shape.classList.add('lot-selected');
        renderLotPanel(entry);
      });
    });

    applyPlanPalette();
  };

  const loadPackage = async (slug) => {
    const url = `/api/public/map-groups/${encodeURIComponent(slug)}/package`;
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) {
      let message = `Failed to load map (${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) message = body.error;
      } catch (_) {
        message = res.statusText || message;
      }
      throw new Error(message);
    }
    return res.json();
  };

  const loadOverlay = async (url) => {
    const res = await fetch(url, { cache: 'no-cache', credentials: 'omit' });
    if (!res.ok) throw new Error(`Overlay fetch failed (${res.status})`);
    return res.text();
  };

  const init = async () => {
    const slug = getGroupSlug();
    if (!slug) {
      setStatus('Missing group', 'error');
      showEmptyPanel('Missing group');
      return;
    }

    try {
      setStatus('Loading map...');
      const pkg = await loadPackage(slug);
      const title = formatTitle(pkg?.group?.slug || slug);
      if (communityNameEl) communityNameEl.textContent = title;

      const layers = Array.isArray(pkg?.layers) ? pkg.layers : [];
      planPalette = {};
      layers.forEach((layer) => {
        const localPalette = loadLocalPalette(layer?.communityId || '');
        const serverPalette = normalizePalette(layer?.planPalette || {});
        mergePalette(planPalette, { ...localPalette, ...serverPalette });
      });
      buildLotIndex(layers);
      layers.forEach((layer) => activeLayers.add(layer.key));
      renderFilters(layers);

      const backgroundUrl = pkg?.baseMap?.backgroundUrl || '';
      if (bgImg) {
        if (backgroundUrl) {
          bgImg.src = backgroundUrl;
          bgImg.classList.remove('is-hidden');
          stageEl?.classList.remove('no-bg');
        } else {
          bgImg.classList.add('is-hidden');
          stageEl?.classList.add('no-bg');
        }
      }

      const overlayUrl = pkg?.baseMap?.overlaySvgUrl || '';
      if (!overlayUrl) {
        setStatus('Map not available', 'error');
        showEmptyPanel('Map unavailable');
        return;
      }

      const svgText = await loadOverlay(overlayUrl);
      bindOverlay(svgText);
      applyLayerVisibility();
      setStatus('Ready');
    } catch (err) {
      console.error('Embed map load failed', err);
      setStatus('Error loading map', 'error');
      showEmptyPanel('Map failed to load');
    }
  };

  styleToggleEl?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const mode = target.dataset.style;
    if (!mode) return;
    applyStyleMode(mode);
  });

  applyStyleMode('status');
  init();
})();
