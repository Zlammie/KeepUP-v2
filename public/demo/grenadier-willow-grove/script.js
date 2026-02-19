(() => {
  const mapWrapper = document.querySelector('.map-wrapper');
  const inlineIframe = document.getElementById('map-embed-inline');
  const modalIframe = document.getElementById('map-embed-modal');
  const placeholder = document.querySelector('.map-placeholder');
  const status = document.querySelector('.dev-toggle-status');
  const mapUrlLabel = document.querySelector('.map-url');
  const toggleButtons = document.querySelectorAll('.dev-toggle [data-mode]');
  const openMapModalButton = document.getElementById('open-map-modal');
  const mapPreviewOverlay = document.getElementById('map-preview-overlay');
  const closeMapModalButton = document.getElementById('close-map-modal');
  const mapModal = document.getElementById('map-modal');
  const mapModalCloseTargets = document.querySelectorAll('[data-map-close]');

  if (!mapWrapper || !inlineIframe || !modalIframe || !mapModal) {
    return;
  }

  const MOBILE_BREAKPOINT = 900;
  const params = new URLSearchParams(window.location.search);
  const showDevTools = params.get('devtools') === '1' || params.get('devTools') === '1';
  document.body.classList.toggle('show-dev-tools', showDevTools);

  const fallbackSvg = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="840" viewBox="0 0 1400 840">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#e8dfd4"/>
          <stop offset="100%" stop-color="#f4eee6"/>
        </linearGradient>
      </defs>
      <rect width="1400" height="840" fill="url(#bg)"/>
      <rect x="36" y="36" width="1328" height="768" rx="28" fill="none" stroke="#c6b9aa" stroke-width="6"/>
      <text x="700" y="410" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="42" fill="#6f655b">Community Map Placeholder</text>
      <text x="700" y="460" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="22" fill="#8d8276">Embed unavailable or loading</text>
    </svg>`
  )}`;

  placeholder.addEventListener('error', () => {
    placeholder.src = fallbackSvg;
  });

  const splitUrlParts = (url) => {
    const [baseWithQuery, hash = ''] = String(url).split('#');
    const [base, query = ''] = baseWithQuery.split('?');
    return { base, query, hash };
  };

  const updateUiParam = (url, mobileMode) => {
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.origin);
      if (mobileMode) parsed.searchParams.set('ui', 'mobile');
      else parsed.searchParams.delete('ui');
      return parsed.toString();
    } catch (_) {
      const { base, query, hash } = splitUrlParts(url);
      const urlParams = new URLSearchParams(query);
      if (mobileMode) urlParams.set('ui', 'mobile');
      else urlParams.delete('ui');
      const qs = urlParams.toString();
      const hashPart = hash ? `#${hash}` : '';
      return `${base}${qs ? `?${qs}` : ''}${hashPart}`;
    }
  };

  const setIframeSrc = (iframe, nextUrl) => {
    if (!iframe) return;
    if (iframe.src === nextUrl) return;
    iframe.src = nextUrl;
  };

  const setStickyOffsets = () => {
    const header = document.querySelector('.site-header');
    const promo = document.querySelector('.promo-banner');
    if (!header || !promo) {
      return;
    }
    const headerHeight = header.offsetHeight || 0;
    const promoHeight = promo.offsetHeight || 0;
    document.documentElement.style.setProperty('--header-offset', `${headerHeight}px`);
    document.documentElement.style.setProperty('--sticky-offset', `${headerHeight + promoHeight + 16}px`);
  };

  const embedDefault = inlineIframe.dataset.embedDefault || inlineIframe.src;
  const embedLocal = inlineIframe.dataset.embedLocal || '';
  const embedUrlParam = params.get('embedUrl');
  const embedMode = params.get('embed');

  let resolvedEmbedUrl = embedDefault;
  if (embedUrlParam) {
    resolvedEmbedUrl = embedUrlParam;
  } else if (embedMode === 'local' && embedLocal) {
    resolvedEmbedUrl = embedLocal;
  }

  const desktopEmbedUrl = updateUiParam(resolvedEmbedUrl, false);
  const mobileEmbedUrl = updateUiParam(desktopEmbedUrl, true);

  let autoState = 'embed';
  let manualState = null;
  let inlineLoadTimer = null;

  const isMobileLayout = () => window.innerWidth < MOBILE_BREAKPOINT;
  const isModalOpen = () => mapModal.classList.contains('is-open');

  const updateMapUrlLabel = (url) => {
    if (!mapUrlLabel) return;
    mapUrlLabel.textContent = url;
  };

  const updateState = (reason) => {
    const state = manualState || autoState;
    mapWrapper.dataset.state = state;

    if (status) {
      const source = manualState ? 'Manual' : 'Auto';
      const suffix = reason ? ` (${reason})` : '';
      status.textContent = `State: ${source} ${state}${suffix}`;
    }
  };

  const clearInlineLoadTimer = () => {
    if (!inlineLoadTimer) return;
    window.clearTimeout(inlineLoadTimer);
    inlineLoadTimer = null;
  };

  const detectInlineBlocked = () => {
    try {
      const doc = inlineIframe.contentDocument || inlineIframe.contentWindow?.document;
      if (!doc || !doc.location) return false;
      return doc.location.href === 'about:blank';
    } catch (_) {
      return false;
    }
  };

  const startInlineLoadWatch = () => {
    clearInlineLoadTimer();
    inlineLoadTimer = window.setTimeout(() => {
      autoState = 'placeholder';
      updateState('timeout');
    }, 4000);
  };

  const closeMapModal = () => {
    if (!isModalOpen()) return;
    mapModal.classList.remove('is-open');
    mapModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  };

  const openMapModal = () => {
    if (!isMobileLayout()) return;
    setIframeSrc(modalIframe, mobileEmbedUrl);
    mapModal.classList.add('is-open');
    mapModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    closeMapModalButton?.focus();
  };

  const syncLayoutOnResize = () => {
    const mobile = isMobileLayout();

    if (!mobile && isModalOpen()) {
      closeMapModal();
    }

    if (mobile) {
      setIframeSrc(inlineIframe, mobileEmbedUrl);
      updateMapUrlLabel(mobileEmbedUrl);
      autoState = 'embed';
      updateState('mobile');
      startInlineLoadWatch();
      return;
    }

    setIframeSrc(inlineIframe, desktopEmbedUrl);
    updateMapUrlLabel(desktopEmbedUrl);
    autoState = 'embed';
    updateState('desktop');
    startInlineLoadWatch();
  };

  inlineIframe.addEventListener('load', () => {
    clearInlineLoadTimer();
    autoState = detectInlineBlocked() ? 'placeholder' : 'embed';
    updateState(autoState === 'embed' ? 'loaded' : 'blocked');
  });

  inlineIframe.addEventListener('error', () => {
    clearInlineLoadTimer();
    autoState = 'placeholder';
    updateState('error');
  });

  toggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      manualState = button.dataset.mode || 'embed';
      updateState('toggle');
    });
  });

  openMapModalButton?.addEventListener('click', openMapModal);
  mapPreviewOverlay?.addEventListener('click', openMapModal);
  closeMapModalButton?.addEventListener('click', closeMapModal);
  mapModalCloseTargets.forEach((target) => {
    target.addEventListener('click', closeMapModal);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMapModal();
    }
  });

  window.addEventListener('resize', () => {
    setStickyOffsets();
    syncLayoutOnResize();
  });

  setStickyOffsets();
  syncLayoutOnResize();
  updateState('init');
})();
