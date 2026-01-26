import {
  buildWpInventoryUrl,
  hasViewHomeLink,
  resolveWpCommunitySlug,
  shouldShowWpUrlHint
} from '../shared/wpInventory.js';

(() => {
  const root = document.getElementById('embed-group-root');
  const statusEl = document.getElementById('embed-status');
  const communityNameEl = document.getElementById('embed-community-name');
  const overlayEl = document.getElementById('map-overlay');
  const bgImg = document.getElementById('map-bg');
  const stageEl = document.getElementById('map-stage');
  const frameEl = document.getElementById('map-frame');
  const filtersEl = document.getElementById('layer-filters');
  const emptyMessageEl = document.getElementById('map-empty-message');
  const styleToggleEl = document.getElementById('map-style-toggle');
  const styleNonce = root?.dataset?.cspNonce || '';
  const zoomInBtn = document.querySelector('[data-zoom="in"]');
  const zoomOutBtn = document.querySelector('[data-zoom="out"]');
  const zoomResetBtn = document.querySelector('[data-zoom="reset"]');
  const zoomLabel = document.querySelector('[data-zoom="label"]');

  const lotTitle = document.getElementById('lot-title');
  const lotStatus = document.getElementById('lot-status');
  const lotAddress = document.getElementById('lot-address');
  const lotPlan = document.getElementById('lot-plan');
  const lotPlanLink = document.getElementById('lot-plan-link');
  const lotSqft = document.getElementById('lot-sqft');
  const lotBeds = document.getElementById('lot-beds');
  const lotBaths = document.getElementById('lot-baths');
  const lotStories = document.getElementById('lot-stories');
  const lotGarage = document.getElementById('lot-garage');
  const lotPrice = document.getElementById('lot-price');
  const lotPriceField = document.getElementById('lot-price-field');
  const lotEmpty = document.getElementById('lot-empty');
  const lotDetails = document.getElementById('lot-details');
  const lotLink = document.getElementById('lot-link');
  const lotWpLink = document.getElementById('lot-wp-link');
  const lotWpUrl = document.getElementById('lot-wp-url');

  const MAX_ADDRESS_LABELS = 400;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3;
  const ZOOM_STEP = 0.2;
  const DRAG_THRESHOLD = 6;

  let activeShape = null;
  let styleMode = 'status';
  const layerShapes = new Map();
  const layerMeta = new Map();
  const activeLayers = new Set();
  const lotIndex = new Map();
  const planClasses = new Set();
  const paletteStyleId = 'embed-group-plan-palette-style';
  let planPalette = {};
  const viewState = {
    scale: 1,
    translateX: 0,
    translateY: 0,
    baseWidth: 0,
    baseHeight: 0,
    fitScale: 1,
    hasInitialView: false,
    isDragging: false,
    dragStart: null,
    dragOrigin: null,
    suppressClick: false,
    pointers: new Map(),
    pinchStart: null,
    frame: {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      paddingLeft: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0
    }
  };

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

  const STATUS_PALETTE_KEYS = new Set([
    'default',
    'available',
    'spec',
    'coming-soon',
    'hold',
    'model',
    'sold',
    'closed'
  ]);

  const STATUS_VARIABLES = {
    default: '--lot-default',
    available: '--lot-available',
    spec: '--lot-spec',
    'coming-soon': '--lot-coming-soon',
    hold: '--lot-hold',
    model: '--lot-model',
    sold: '--lot-sold',
    closed: '--lot-closed'
  };

  const normalizeStatusKey = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    const slug = raw.replace(/[_\s]+/g, '-');
    if (slug === 'comingsoon') return 'coming-soon';
    return slug;
  };

  const normalizeStatusPalette = (input) => {
    const out = {};
    if (!input || typeof input !== 'object') return out;
    Object.entries(input).forEach(([key, value]) => {
      const normalizedKey = normalizeStatusKey(key);
      if (!STATUS_PALETTE_KEYS.has(normalizedKey)) return;
      const trimmedValue = String(value || '').trim().toLowerCase();
      if (!isHexColor(trimmedValue)) return;
      out[normalizedKey] = trimmedValue;
    });
    return out;
  };

  const applyStatusPalette = (palette) => {
    if (!root) return;
    Object.entries(STATUS_VARIABLES).forEach(([key, cssVar]) => {
      const value = palette?.[key];
      if (isHexColor(value)) {
        root.style.setProperty(cssVar, value);
      } else {
        root.style.removeProperty(cssVar);
      }
    });
  };

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

  // wpCommunitySlug priority: ?wpCommunitySlug= override, otherwise map-group slug.
  const wpCommunitySlug = resolveWpCommunitySlug(getGroupSlug());
  const showWpUrlHint = shouldShowWpUrlHint();

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
    return norm === 'available' || norm === 'spec' || norm === 'coming-soon';
  };

  const formatStatus = (value) => {
    const text = String(value || '').trim();
    const normalized = normalizeStatus(text);
    const labels = {
      available: 'Available',
      sold: 'Sold',
      closed: 'Closed',
      hold: 'Future Homesite',
      model: 'Model',
      spec: 'SPEC',
      'coming-soon': 'Coming Soon'
    };
    if (normalized && labels[normalized]) return labels[normalized];
    return text || 'Unknown';
  };

  const getAddressNumber = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    const match = text.match(/^\s*(\d+)/);
    return match ? match[1] : '';
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

  const updateZoomLabel = () => {
    if (!zoomLabel) return;
    zoomLabel.textContent = `${Math.round(viewState.scale * 100)}%`;
  };

  const updateFrameMetrics = () => {
    if (!frameEl) return;
    const rect = frameEl.getBoundingClientRect();
    const styles = window.getComputedStyle(frameEl);
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    viewState.frame.left = rect.left;
    viewState.frame.top = rect.top;
    viewState.frame.width = rect.width - paddingLeft - paddingRight;
    viewState.frame.height = rect.height - paddingTop - paddingBottom;
    viewState.frame.paddingLeft = paddingLeft;
    viewState.frame.paddingTop = paddingTop;
    viewState.frame.paddingRight = paddingRight;
    viewState.frame.paddingBottom = paddingBottom;
  };

  const clampScale = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const clampTranslate = () => {
    if (!frameEl || !viewState.baseWidth || !viewState.baseHeight) return;
    const frameWidth = viewState.frame.width;
    const frameHeight = viewState.frame.height;
    const scaledWidth = viewState.baseWidth * viewState.scale;
    const scaledHeight = viewState.baseHeight * viewState.scale;

    if (scaledWidth <= frameWidth) {
      viewState.translateX = (frameWidth - scaledWidth) / 2;
    } else {
      const minX = frameWidth - scaledWidth;
      viewState.translateX = Math.min(0, Math.max(minX, viewState.translateX));
    }

    if (scaledHeight <= frameHeight) {
      viewState.translateY = (frameHeight - scaledHeight) / 2;
    } else {
      const minY = frameHeight - scaledHeight;
      viewState.translateY = Math.min(0, Math.max(minY, viewState.translateY));
    }
  };

  const applyTransform = () => {
    if (!stageEl) return;
    const scale = Number.isFinite(viewState.scale) ? viewState.scale : 1;
    const translateX = Number.isFinite(viewState.translateX) ? viewState.translateX : 0;
    const translateY = Number.isFinite(viewState.translateY) ? viewState.translateY : 0;
    stageEl.style.setProperty('--map-scale', scale.toFixed(3));
    stageEl.style.setProperty('--map-translate-x', `${Math.round(translateX)}px`);
    stageEl.style.setProperty('--map-translate-y', `${Math.round(translateY)}px`);
    updateZoomLabel();
  };

  const sharpenMap = () => {
    if (!stageEl) return;
    stageEl.style.transform = 'translateZ(0)';
    window.requestAnimationFrame(() => {
      stageEl.style.transform = '';
    });
  };

  const updateBounds = () => {
    if (!stageEl || !frameEl) return false;
    updateFrameMetrics();
    const baseWidth = stageEl.offsetWidth;
    const baseHeight = stageEl.offsetHeight;
    if (!baseWidth || !baseHeight) return false;
    viewState.baseWidth = baseWidth;
    viewState.baseHeight = baseHeight;
    const fitScale = Math.min(
      viewState.frame.width / baseWidth,
      viewState.frame.height / baseHeight,
      1
    );
    viewState.fitScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
    return true;
  };

  const getFrameCenter = () => {
    return {
      x: viewState.frame.width / 2,
      y: viewState.frame.height / 2
    };
  };

  const getFramePoint = (event) => {
    return {
      x: event.clientX - viewState.frame.left - viewState.frame.paddingLeft,
      y: event.clientY - viewState.frame.top - viewState.frame.paddingTop
    };
  };

  const zoomToPoint = (nextScale, center, baseScale = viewState.scale, baseX = viewState.translateX, baseY = viewState.translateY) => {
    const scale = clampScale(nextScale);
    const worldX = (center.x - baseX) / baseScale;
    const worldY = (center.y - baseY) / baseScale;
    viewState.scale = scale;
    viewState.translateX = center.x - (worldX * scale);
    viewState.translateY = center.y - (worldY * scale);
    clampTranslate();
    applyTransform();
  };

  const resetView = (force = false) => {
    if (!updateBounds()) return;
    if (!force && viewState.hasInitialView) {
      clampTranslate();
      applyTransform();
      return;
    }
    viewState.scale = viewState.fitScale;
    viewState.translateX = 0;
    viewState.translateY = 0;
    clampTranslate();
    applyTransform();
    viewState.hasInitialView = true;
  };

  const initPanZoom = () => {
    if (!frameEl || !stageEl) return;
    if (updateBounds()) {
      clampTranslate();
      applyTransform();
    }

    const handlePointerDown = (event) => {
      if (event.button && event.button !== 0) return;
      if (event.target.closest('.embed-map-zoom')) return;
      updateFrameMetrics();
      const point = getFramePoint(event);
      viewState.pointers.set(event.pointerId, point);

      if (viewState.pointers.size === 1) {
        viewState.isDragging = false;
        viewState.dragStart = point;
        viewState.dragOrigin = {
          x: viewState.translateX,
          y: viewState.translateY
        };
      }

      if (viewState.pointers.size === 2) {
        const points = Array.from(viewState.pointers.values());
        const [p1, p2] = points;
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        viewState.pinchStart = {
          distance,
          center,
          scale: viewState.scale,
          translateX: viewState.translateX,
          translateY: viewState.translateY
        };
      }
    };

    const handlePointerMove = (event) => {
      if (!viewState.pointers.has(event.pointerId)) return;
      const point = getFramePoint(event);
      viewState.pointers.set(event.pointerId, point);

      if (viewState.pointers.size === 2 && viewState.pinchStart) {
        event.preventDefault();
        const points = Array.from(viewState.pointers.values());
        const [p1, p2] = points;
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (viewState.pinchStart.distance > 0) {
          const scale = viewState.pinchStart.scale * (distance / viewState.pinchStart.distance);
          const center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          zoomToPoint(
            scale,
            center,
            viewState.pinchStart.scale,
            viewState.pinchStart.translateX,
            viewState.pinchStart.translateY
          );
        }
        return;
      }

      if (!viewState.dragStart || !viewState.dragOrigin) return;
      const dx = point.x - viewState.dragStart.x;
      const dy = point.y - viewState.dragStart.y;
      if (!viewState.isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        viewState.isDragging = true;
        viewState.suppressClick = true;
        frameEl.classList.add('is-dragging');
      }

      if (viewState.isDragging) {
        event.preventDefault();
        viewState.translateX = viewState.dragOrigin.x + dx;
        viewState.translateY = viewState.dragOrigin.y + dy;
        clampTranslate();
        applyTransform();
      }
    };

    const handlePointerUp = (event) => {
      if (viewState.pointers.has(event.pointerId)) {
        viewState.pointers.delete(event.pointerId);
      }
      if (viewState.pointers.size < 2) {
        viewState.pinchStart = null;
      }
      if (viewState.pointers.size === 1) {
        const remaining = Array.from(viewState.pointers.values())[0];
        viewState.isDragging = false;
        viewState.dragStart = remaining;
        viewState.dragOrigin = {
          x: viewState.translateX,
          y: viewState.translateY
        };
        frameEl.classList.remove('is-dragging');
      }
      if (viewState.pointers.size === 0) {
        viewState.isDragging = false;
        viewState.dragStart = null;
        viewState.dragOrigin = null;
        frameEl.classList.remove('is-dragging');
        sharpenMap();
      }
    };

    frameEl.addEventListener('pointerdown', handlePointerDown);
    frameEl.addEventListener('pointermove', handlePointerMove);
    frameEl.addEventListener('pointerup', handlePointerUp);
    frameEl.addEventListener('pointercancel', handlePointerUp);
    frameEl.addEventListener('pointerleave', handlePointerUp);
    frameEl.addEventListener('click', (event) => {
      if (!viewState.suppressClick) return;
      if (event.target.closest('.embed-map-zoom')) {
        viewState.suppressClick = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      viewState.suppressClick = false;
    });

    zoomInBtn?.addEventListener('click', () => {
      if (!updateBounds()) return;
      zoomToPoint(viewState.scale + ZOOM_STEP, getFrameCenter());
      sharpenMap();
    });
    zoomOutBtn?.addEventListener('click', () => {
      if (!updateBounds()) return;
      zoomToPoint(viewState.scale - ZOOM_STEP, getFrameCenter());
      sharpenMap();
    });
    zoomResetBtn?.addEventListener('click', () => resetView(true));

    window.addEventListener('resize', () => {
      if (!updateBounds()) return;
      clampTranslate();
      applyTransform();
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
    if (lotStatus) {
      lotStatus.textContent = '-';
      delete lotStatus.dataset.status;
    }
    if (lotAddress) lotAddress.textContent = '-';
    if (lotPlan) lotPlan.textContent = '-';
    if (lotPlanLink) {
      lotPlanLink.href = '#';
      lotPlanLink.classList.add('is-hidden');
    }
    if (lotSqft) lotSqft.textContent = '-';
    if (lotBeds) lotBeds.textContent = '-';
    if (lotBaths) lotBaths.textContent = '-';
    if (lotStories) lotStories.textContent = '-';
    if (lotGarage) lotGarage.textContent = '-';
    if (lotPrice) {
      lotPrice.textContent = '-';
      lotPrice.classList.remove('price-none');
    }
    if (lotPriceField) lotPriceField.classList.remove('is-hidden');
    if (lotEmpty) lotEmpty.classList.remove('is-hidden');
    if (lotDetails) lotDetails.classList.add('is-hidden');
    if (lotLink) lotLink.classList.add('is-hidden');
    if (lotWpLink) lotWpLink.classList.add('is-hidden');
    if (lotWpUrl) lotWpUrl.classList.add('is-hidden');
  };

  const updateWpLink = (entry) => {
    if (!lotWpLink) return;
    const address = String(entry?.address || '').trim();
    const hasLink = hasViewHomeLink(entry);
    if (!wpCommunitySlug || !address || !hasLink) {
      lotWpLink.classList.add('is-hidden');
      lotWpLink.dataset.url = '';
      if (lotWpUrl) lotWpUrl.classList.add('is-hidden');
      return;
    }
    const url = buildWpInventoryUrl({ wpCommunitySlug, address });
    if (!url) {
      lotWpLink.classList.add('is-hidden');
      lotWpLink.dataset.url = '';
      if (lotWpUrl) lotWpUrl.classList.add('is-hidden');
      return;
    }
    lotWpLink.dataset.url = url;
    lotWpLink.classList.remove('is-hidden');
    if (lotWpUrl) {
      if (showWpUrlHint) {
        lotWpUrl.textContent = url;
        lotWpUrl.classList.remove('is-hidden');
      } else {
        lotWpUrl.classList.add('is-hidden');
      }
    }
  };

  const renderLotPanel = (entry) => {
    if (!entry) {
      showEmptyPanel('No lot selected');
      return;
    }
    const labelText = entry.address || 'Selected lot';
    if (lotTitle) lotTitle.textContent = labelText;
    if (lotStatus) {
      const statusKey = normalizeStatus(entry.status);
      lotStatus.textContent = formatStatus(entry.status) || '-';
      if (statusKey) lotStatus.dataset.status = statusKey;
      else delete lotStatus.dataset.status;
    }
    if (lotAddress) lotAddress.textContent = entry.address || '-';
    if (lotPlan) {
      const plan = entry.floorPlanName || entry.floorPlanNumber || '';
      lotPlan.textContent = plan || '-';
    }
    if (lotPlanLink) {
      const planUrl = entry.floorPlanUrl || '';
      if (planUrl) {
        lotPlanLink.href = planUrl;
        lotPlanLink.classList.remove('is-hidden');
      } else {
        lotPlanLink.href = '#';
        lotPlanLink.classList.add('is-hidden');
      }
    }
    if (lotSqft) lotSqft.textContent = formatNumber(entry.squareFeet);
    if (lotBeds) lotBeds.textContent = formatNumber(entry.beds);
    if (lotBaths) lotBaths.textContent = formatNumber(entry.baths);
    if (lotStories) lotStories.textContent = formatNumber(entry.stories);
    if (lotGarage) lotGarage.textContent = formatNumber(entry.garage);
    if (lotPrice) {
      const priceVal = Number(entry.price);
      const hasPrice = Number.isFinite(priceVal) && priceVal > 0;
      lotPrice.textContent = hasPrice ? formatCurrency(priceVal) : 'Contact for Pricing';
      lotPrice.classList.toggle('price-none', !hasPrice);
    }
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

    updateWpLink(entry);
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

  const addAddressLabel = (svgEl, shape, labelText, layerKey) => {
    if (!svgEl || !shape || !labelText) return;
    let bbox = null;
    try {
      bbox = shape.getBBox();
    } catch (_) {
      return;
    }
    if (!bbox || !Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) return;
    const centerX = bbox.x + (bbox.width / 2);
    const centerY = bbox.y + (bbox.height / 2);

    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', centerX);
    textEl.setAttribute('y', centerY);
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('dominant-baseline', 'central');
    textEl.textContent = labelText;
    textEl.classList.add('lot-address-label');
    if (layerKey) textEl.dataset.layer = layerKey;
    if (bbox.height > bbox.width) {
      textEl.classList.add('lot-address-label--vertical');
      textEl.setAttribute('transform', `rotate(-90 ${centerX} ${centerY})`);
    }

    let labelLayer = svgEl.querySelector('.lot-address-layer');
    if (!labelLayer) {
      labelLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      labelLayer.classList.add('lot-address-layer');
      svgEl.appendChild(labelLayer);
    }
    labelLayer.appendChild(textEl);
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

    const labels = overlayEl?.querySelectorAll('.lot-address-label') || [];
    labels.forEach((label) => {
      const key = label.dataset.layer;
      if (!key) return;
      label.classList.toggle('is-hidden', !activeLayers.has(key));
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
    const allowLabels = lotIndex.size > 0 && lotIndex.size <= MAX_ADDRESS_LABELS;
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

      if (allowLabels) {
        const addressNumber = getAddressNumber(entry.address);
        if (addressNumber) addAddressLabel(svgEl, shape, addressNumber, entry.layerKey);
      }

      if (!layerShapes.has(entry.layerKey)) layerShapes.set(entry.layerKey, []);
      layerShapes.get(entry.layerKey).push(shape);

      shape.addEventListener('click', (event) => {
        event.preventDefault();
        if (viewState.suppressClick) {
          viewState.suppressClick = false;
          return;
        }
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
      const statusPalette = normalizeStatusPalette(pkg?.statusPalette || {});
      applyStatusPalette(statusPalette);

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
          bgImg.addEventListener('load', () => resetView(), { once: true });
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
      resetView();
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

  lotWpLink?.addEventListener('click', (event) => {
    const url = lotWpLink.dataset.url;
    if (!url) return;
    event.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  applyStyleMode('plan');
  initPanZoom();
  init();
})();
