import {
  buildWpInventoryUrl,
  hasViewHomeLink,
  resolveWpCommunitySlug,
  shouldShowWpUrlHint
} from '../shared/wpInventory.js';

(() => {
  const root = document.getElementById('embed-root');
  const statusEl = document.getElementById('embed-status');
  const communityNameEl = document.getElementById('embed-community-name');
  const overlayEl = document.getElementById('map-overlay');
  const bgImg = document.getElementById('map-bg');
  const stageEl = document.getElementById('map-stage');
  const frameEl = document.getElementById('map-frame');
  const styleToggleEl = document.getElementById('map-style-toggle');
  const styleNonce = root?.dataset?.cspNonce || '';
  const zoomInBtn = frameEl?.querySelector('[data-zoom="in"]');
  const zoomOutBtn = frameEl?.querySelector('[data-zoom="out"]');
  const zoomResetBtn = frameEl?.querySelector('[data-zoom="reset"]');
  const zoomLabel = frameEl?.querySelector('[data-zoom="label"]');
  const sheetEl = document.getElementById('lot-sheet');
  const sheetToggle = document.getElementById('lot-sheet-toggle');
  const sheetDetails = document.getElementById('lot-sheet-details');
  const summaryAddress = document.getElementById('lot-summary-address');
  const summaryStatus = document.getElementById('lot-summary-status');
  const summaryPrice = document.getElementById('lot-summary-price');
  const summaryStats = document.getElementById('lot-summary-stats');
  const summaryWpLink = document.getElementById('lot-summary-wp-link');

  const params = new URLSearchParams(window.location.search);
  const uiMode = params.get('ui');
  if (uiMode === 'mobile') {
    document.body.classList.add('ui-mobile');
  }

  let panelMode = 'auto';
  let hasManualCollapse = false;
  let hasFirstSelection = false;
  let lastSelectedId = null;

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
  const planClasses = new Set();
  const paletteStyleId = 'embed-plan-palette-style';
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

  const getCommunitySlug = () => {
    const fromData = root?.dataset?.community || '';
    if (fromData) return fromData;

    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('community') || params.get('communitySlug') || '';
    if (fromQuery) return fromQuery;

    const parts = window.location.pathname.split('/').filter(Boolean);
    const mapIndex = parts.indexOf('map');
    if (mapIndex > -1 && parts[mapIndex + 1]) return parts[mapIndex + 1];
    return '';
  };

  // wpCommunitySlug priority: ?wpCommunitySlug= override, otherwise community slug.
  const wpCommunitySlug = resolveWpCommunitySlug(getCommunitySlug());
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
      closed: 'Sold',
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

  const getSheetOverlap = (frameRect, paddingTop, paddingBottom) => {
    if (!document.body.classList.contains('ui-mobile')) return 0;
    if (!sheetEl || sheetEl.dataset.state === 'hidden') return 0;
    const sheetRect = sheetEl.getBoundingClientRect();
    if (!sheetRect.height) return 0;
    const contentTop = frameRect.top + paddingTop;
    const contentBottom = frameRect.bottom - paddingBottom;
    if (sheetRect.top >= contentBottom) return 0;
    if (sheetRect.bottom <= contentTop) return 0;
    const overlap = contentBottom - sheetRect.top;
    const maxOverlap = Math.max(0, contentBottom - contentTop);
    return Math.max(0, Math.min(overlap, maxOverlap));
  };

  const updateFrameMetrics = () => {
    if (!frameEl) return;
    const rect = frameEl.getBoundingClientRect();
    const styles = window.getComputedStyle(frameEl);
    const paddingLeft = Number.parseFloat(styles.paddingLeft) || 0;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingRight = Number.parseFloat(styles.paddingRight) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const visibleHeight = rect.height - paddingTop - paddingBottom;
    const overlap = getSheetOverlap(rect, paddingTop, paddingBottom);
    viewState.frame.left = rect.left;
    viewState.frame.top = rect.top;
    viewState.frame.width = rect.width - paddingLeft - paddingRight;
    viewState.frame.height = Math.max(0, visibleHeight - overlap);
    viewState.frame.paddingLeft = paddingLeft;
    viewState.frame.paddingTop = paddingTop;
    viewState.frame.paddingRight = paddingRight;
    viewState.frame.paddingBottom = paddingBottom;
  };

  const refreshFrameClamp = () => {
    if (!frameEl || !stageEl) return;
    updateFrameMetrics();
    clampTranslate();
    applyTransform();
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

  const getFrameCenter = () => ({
    x: viewState.frame.width / 2,
    y: viewState.frame.height / 2
  });

  const getFramePoint = (event) => ({
    x: event.clientX - viewState.frame.left - viewState.frame.paddingLeft,
    y: event.clientY - viewState.frame.top - viewState.frame.paddingTop
  });

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
      collapseSheetIfExpanded();
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
      collapseSheetIfExpanded();
      zoomToPoint(viewState.scale + ZOOM_STEP, getFrameCenter());
      sharpenMap();
    });
    zoomOutBtn?.addEventListener('click', () => {
      if (!updateBounds()) return;
      collapseSheetIfExpanded();
      zoomToPoint(viewState.scale - ZOOM_STEP, getFrameCenter());
      sharpenMap();
    });
    zoomResetBtn?.addEventListener('click', () => {
      collapseSheetIfExpanded();
      resetView(true);
    });

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

  const setSheetState = (state, options = {}) => {
    if (!sheetEl) return;
    const nextState = ['collapsed', 'expanded', 'hidden'].includes(state)
      ? state
      : 'collapsed';
    sheetEl.dataset.state = nextState;
    if (sheetToggle) {
      sheetToggle.setAttribute('aria-expanded', nextState === 'expanded' ? 'true' : 'false');
    }
    if (sheetDetails) {
      sheetDetails.setAttribute('aria-hidden', nextState === 'expanded' ? 'false' : 'true');
    }
    if (options.manual) {
      panelMode = 'manual';
      if (nextState === 'collapsed') {
        hasManualCollapse = true;
      }
    }
    refreshFrameClamp();
  };

  const collapseSheetIfExpanded = () => {
    if (!document.body.classList.contains('ui-mobile')) return;
    if (!sheetEl || sheetEl.dataset.state !== 'expanded') return;
    setSheetState('collapsed');
  };

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
    if (summaryAddress) summaryAddress.textContent = title;
    if (summaryStatus) {
      summaryStatus.textContent = '-';
      delete summaryStatus.dataset.status;
    }
    if (summaryPrice) {
      summaryPrice.textContent = '';
      summaryPrice.classList.add('is-hidden');
    }
    if (summaryStats) {
      summaryStats.textContent = '';
      summaryStats.classList.add('is-hidden');
    }
    if (summaryWpLink) summaryWpLink.classList.add('is-hidden');
    setSheetState('collapsed');
  };

  const updateWpLink = (lot) => {
    if (!lotWpLink && !summaryWpLink) return;
    const address = String(lot?.address || '').trim();
    const hasLink = hasViewHomeLink(lot);
    if (!wpCommunitySlug || !address || !hasLink) {
      if (lotWpLink) {
        lotWpLink.classList.add('is-hidden');
        lotWpLink.dataset.url = '';
      }
      if (summaryWpLink) {
        summaryWpLink.classList.add('is-hidden');
        summaryWpLink.dataset.url = '';
      }
      if (lotWpUrl) lotWpUrl.classList.add('is-hidden');
      return;
    }
    const url = buildWpInventoryUrl({ wpCommunitySlug, address });
    if (!url) {
      if (lotWpLink) {
        lotWpLink.classList.add('is-hidden');
        lotWpLink.dataset.url = '';
      }
      if (summaryWpLink) {
        summaryWpLink.classList.add('is-hidden');
        summaryWpLink.dataset.url = '';
      }
      if (lotWpUrl) lotWpUrl.classList.add('is-hidden');
      return;
    }
    if (lotWpLink) {
      lotWpLink.dataset.url = url;
      lotWpLink.classList.remove('is-hidden');
    }
    if (summaryWpLink) {
      summaryWpLink.dataset.url = url;
      summaryWpLink.classList.remove('is-hidden');
    }
    if (lotWpUrl) {
      if (showWpUrlHint) {
        lotWpUrl.textContent = url;
        lotWpUrl.classList.remove('is-hidden');
      } else {
        lotWpUrl.classList.add('is-hidden');
      }
    }
  };

  const buildSummaryStats = (lot) => {
    const parts = [];
    const beds = Number(lot?.beds);
    const baths = Number(lot?.baths);
    const sqft = Number(lot?.squareFeet);
    if (Number.isFinite(beds) && beds > 0) parts.push(`${formatNumber(beds)} Beds`);
    if (Number.isFinite(baths) && baths > 0) parts.push(`${formatNumber(baths)} Baths`);
    if (Number.isFinite(sqft) && sqft > 0) parts.push(`${formatNumber(sqft)} Sq Ft`);
    return parts.join(' • ');
  };

  const renderLotPanel = (lot, regionId = null) => {
    if (!lot) {
      showEmptyPanel('No lot selected');
      return;
    }
    const selectionKey = regionId || lot?.id || lot?._id || null;
    const selectionChanged = Boolean(selectionKey && selectionKey !== lastSelectedId);
    const isFirstSelection = !hasFirstSelection;
    const shouldAutoExpand =
      !hasManualCollapse ||
      isFirstSelection ||
      (selectionChanged && panelMode === 'auto');

    if (shouldAutoExpand) {
      setSheetState('expanded');
    }
    hasFirstSelection = true;
    if (selectionKey) {
      lastSelectedId = selectionKey;
    }

    const titleText = lot.address || 'Selected lot';
    if (lotTitle) lotTitle.textContent = titleText;
    if (lotStatus) {
      const statusKey = normalizeStatus(lot.status);
      lotStatus.textContent = formatStatus(lot.status) || '-';
      if (statusKey) lotStatus.dataset.status = statusKey;
      else delete lotStatus.dataset.status;
    }
    if (summaryAddress) {
      summaryAddress.textContent = lot.address || 'Selected lot';
    }
    if (summaryStatus) {
      const statusKey = normalizeStatus(lot.status);
      summaryStatus.textContent = formatStatus(lot.status) || '-';
      if (statusKey) summaryStatus.dataset.status = statusKey;
      else delete summaryStatus.dataset.status;
    }
    if (lotAddress) lotAddress.textContent = lot.address || '-';
    if (lotPlan) {
      const plan = lot.floorPlanName || lot.floorPlanNumber || '';
      lotPlan.textContent = plan || '-';
    }
    if (lotPlanLink) {
      const planUrl = lot.floorPlanUrl || '';
      if (planUrl) {
        lotPlanLink.href = planUrl;
        lotPlanLink.classList.remove('is-hidden');
      } else {
        lotPlanLink.href = '#';
        lotPlanLink.classList.add('is-hidden');
      }
    }
    if (lotSqft) lotSqft.textContent = formatNumber(lot.squareFeet);
    if (lotBeds) lotBeds.textContent = formatNumber(lot.beds);
    if (lotBaths) lotBaths.textContent = formatNumber(lot.baths);
    if (lotStories) lotStories.textContent = formatNumber(lot.stories);
    if (lotGarage) lotGarage.textContent = formatNumber(lot.garage);
    if (lotPrice) {
      const priceVal = Number(lot.price);
      const hasPrice = Number.isFinite(priceVal) && priceVal > 0;
      lotPrice.textContent = hasPrice ? formatCurrency(priceVal) : 'Contact for Pricing';
      lotPrice.classList.toggle('price-none', !hasPrice);
    }
    if (summaryPrice) {
      const priceVal = Number(lot.price);
      const hasPrice = Number.isFinite(priceVal) && priceVal > 0;
      summaryPrice.textContent = hasPrice ? formatCurrency(priceVal) : 'Contact for Pricing';
      summaryPrice.classList.toggle('is-hidden', false);
    }
    if (summaryStats) {
      const statsText = buildSummaryStats(lot);
      summaryStats.textContent = statsText;
      summaryStats.classList.toggle('is-hidden', !statsText);
    }
    if (lotPriceField) {
      const showPrice = shouldShowPrice(lot.status);
      lotPriceField.classList.toggle('is-hidden', !showPrice);
    }
    if (lotEmpty) lotEmpty.classList.add('is-hidden');
    if (lotDetails) lotDetails.classList.remove('is-hidden');

    if (lotLink) {
      if (lot.listingUrl) {
        lotLink.href = lot.listingUrl;
        lotLink.classList.remove('is-hidden');
      } else {
        lotLink.classList.add('is-hidden');
      }
    }

    updateWpLink(lot);
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

  const addAddressLabel = (svgEl, shape, labelText) => {
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

  const bindOverlay = (svgText, lotsByRegion) => {
    if (!overlayEl) return;
    overlayEl.innerHTML = svgText;
    const svgEl = overlayEl.querySelector('svg');
    if (!svgEl) throw new Error('Overlay missing <svg>');
    normalizeSvgViewport(svgEl);

    const shapes = svgEl.querySelectorAll('path[id], polygon[id], rect[id]');
    const allowLabels = lotsByRegion.size > 0 && lotsByRegion.size <= MAX_ADDRESS_LABELS;
    shapes.forEach((shape) => {
      const regionId = shape.id;
      const lot = lotsByRegion.get(regionId) || null;
      if (lot) shape.classList.add('lot-linked');

      const statusClass = normalizeStatus(lot?.status);
      if (statusClass) shape.classList.add(`lot-status-${statusClass}`);
      if (isSoldLike(lot?.status)) shape.classList.add('lot-sold');

      const planClass = pickPlanClass(lot?.floorPlanName, lot?.floorPlanNumber);
      if (planClass) {
        shape.classList.add(planClass);
        planClasses.add(planClass);
      }

      if (allowLabels && lot) {
        const addressNumber = getAddressNumber(lot.address);
        if (addressNumber) addAddressLabel(svgEl, shape, addressNumber);
      }

      shape.addEventListener('click', (event) => {
        event.preventDefault();
        if (viewState.suppressClick) {
          viewState.suppressClick = false;
          return;
        }
        if (activeShape && activeShape !== shape) activeShape.classList.remove('lot-selected');
        activeShape = shape;
        shape.classList.add('lot-selected');
        renderLotPanel(lot, regionId);
      });
    });

    applyPlanPalette();
  };

  const loadPackage = async (slug) => {
    const url = `/api/public/maps/${encodeURIComponent(slug)}/package`;
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
    const slug = getCommunitySlug();
    if (!slug) {
      setStatus('Missing community', 'error');
      showEmptyPanel('Missing community');
      return;
    }

    try {
      setStatus('Loading map...');
      const pkg = await loadPackage(slug);
      const communityName = pkg?.community?.name || 'Community map';
      if (communityNameEl) communityNameEl.textContent = communityName;
      const statusPalette = normalizeStatusPalette(pkg?.statusPalette || {});
      applyStatusPalette(statusPalette);
      const serverPalette = normalizePalette(pkg?.community?.planPalette || pkg?.planPalette || {});
      const localPalette = loadLocalPalette(pkg?.community?.id || '');
      planPalette = { ...localPalette, ...serverPalette };

      const backgroundUrl = pkg?.map?.backgroundUrl || '';
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

      const overlayUrl = pkg?.map?.overlaySvgUrl || '';
      if (!overlayUrl) {
        setStatus('Map not available', 'error');
        showEmptyPanel('Map unavailable');
        return;
      }

      const lotsByRegion = new Map(
        (Array.isArray(pkg?.lots) ? pkg.lots : []).map((lot) => [lot.regionId, lot])
      );
      const svgText = await loadOverlay(overlayUrl);
      bindOverlay(svgText, lotsByRegion);
      resetView();
      setStatus('Ready');
      showEmptyPanel('Select a lot');
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
  summaryWpLink?.addEventListener('click', (event) => {
    const url = summaryWpLink.dataset.url;
    if (!url) return;
    event.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  const initLegendToggle = () => {
    const legendEl = document.querySelector('.embed-map-legend-mini');
    if (!legendEl) return;
    const toggle = legendEl.querySelector('.legend-toggle');
    const list = legendEl.querySelector('.legend-list');
    if (!toggle || !list) return;

    const storageKey = 'embed-map-legend-collapsed';
    const prefersMobile = () => (
      document.body.classList.contains('ui-mobile') ||
      window.matchMedia('(max-width: 768px)').matches
    );

    const readStored = () => {
      try {
        const value = localStorage.getItem(storageKey);
        if (value == null) return null;
        return value === '1';
      } catch (_) {
        return null;
      }
    };

    const applyState = (collapsed, persist = false) => {
      legendEl.classList.toggle('is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (persist) {
        try {
          localStorage.setItem(storageKey, collapsed ? '1' : '0');
        } catch (_) {
          // Ignore storage issues (private mode, etc).
        }
      }
    };

    const syncFromViewport = () => {
      if (!prefersMobile()) {
        applyState(false);
        return;
      }
      const stored = readStored();
      applyState(stored ?? true);
    };

    syncFromViewport();

    toggle.addEventListener('click', () => {
      const nextCollapsed = !legendEl.classList.contains('is-collapsed');
      applyState(nextCollapsed, true);
    });

    const mql = window.matchMedia('(max-width: 768px)');
    const handleResize = () => {
      if (!prefersMobile()) {
        applyState(false);
        return;
      }
      const stored = readStored();
      if (stored == null) return;
      applyState(stored);
    };
    if (mql?.addEventListener) {
      mql.addEventListener('change', handleResize);
    } else if (mql?.addListener) {
      mql.addListener(handleResize);
    }
    window.addEventListener('resize', handleResize);
  };

  initLegendToggle();
  applyStyleMode('status');
  let sheetDragStart = null;
  let sheetDragHandled = false;

  const handleSheetToggle = () => {
    const nextState = sheetEl?.dataset?.state === 'expanded' ? 'collapsed' : 'expanded';
    setSheetState(nextState, { manual: true });
  };

  sheetToggle?.addEventListener('click', (event) => {
    if (sheetDragHandled) {
      sheetDragHandled = false;
      return;
    }
    event.preventDefault();
    handleSheetToggle();
  });
  sheetToggle?.addEventListener('pointerdown', (event) => {
    sheetDragStart = event.clientY;
    sheetDragHandled = false;
    sheetToggle.setPointerCapture?.(event.pointerId);
  });
  sheetToggle?.addEventListener('pointerup', (event) => {
    if (sheetDragStart == null) return;
    const delta = event.clientY - sheetDragStart;
    sheetDragStart = null;
    if (Math.abs(delta) < 24) return;
    sheetDragHandled = true;
    setSheetState(delta < 0 ? 'expanded' : 'collapsed', { manual: true });
  });
  sheetToggle?.addEventListener('pointercancel', () => {
    sheetDragStart = null;
    sheetDragHandled = false;
  });

  setSheetState('collapsed');
  initPanZoom();
  init();
})();
