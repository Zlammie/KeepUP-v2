(() => {
  const mapWrapper = document.querySelector(".map-wrapper");
  const iframe = document.querySelector(".map-embed");
  const placeholder = document.querySelector(".map-placeholder");
  const status = document.querySelector(".dev-toggle-status");
  const mapUrlLabel = document.querySelector(".map-url");
  const toggleButtons = document.querySelectorAll(".dev-toggle [data-mode]");
  const previewButtons = document.querySelectorAll(
    ".preview-toolbar [data-preview]"
  );
  const previewLabel = document.querySelector("[data-preview-label]");
  const previewSize = document.querySelector("[data-preview-size]");
  const previewStorageKey = "keepup-demo-preview";
  const previewSizeValue = "390x844";

  if (!mapWrapper || !iframe || !placeholder) {
    return;
  }

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

  placeholder.addEventListener("error", () => {
    placeholder.src = fallbackSvg;
  });

  const params = new URLSearchParams(window.location.search);
  const embedDefault = iframe.dataset.embedDefault || iframe.src;
  const embedLocal = iframe.dataset.embedLocal || "";
  const embedUrlParam = params.get("embedUrl");
  const embedMode = params.get("embed");
  let resolvedEmbedUrl = embedDefault;

  if (embedUrlParam) {
    resolvedEmbedUrl = embedUrlParam;
  } else if (embedMode === "local" && embedLocal) {
    resolvedEmbedUrl = embedLocal;
  }

  const splitUrlParts = (url) => {
    const [baseWithQuery, hash = ""] = String(url).split("#");
    const [base, query = ""] = baseWithQuery.split("?");
    return { base, query, hash };
  };

  const updateQueryParam = (url, mode) => {
    if (!url) return "";
    try {
      const parsed = new URL(url, window.location.origin);
      if (mode === "mobile") {
        parsed.searchParams.set("ui", "mobile");
      } else {
        parsed.searchParams.delete("ui");
      }
      return parsed.toString();
    } catch (error) {
      const { base, query, hash } = splitUrlParts(url);
      const params = new URLSearchParams(query);
      if (mode === "mobile") {
        params.set("ui", "mobile");
      } else {
        params.delete("ui");
      }
      const qs = params.toString();
      const hashPart = hash ? `#${hash}` : "";
      return `${base}${qs ? `?${qs}` : ""}${hashPart}`;
    }
  };

  const sanitizeEmbedUrl = (url) => updateQueryParam(url, "desktop");

  const buildEmbedUrl = (url, mode) =>
    updateQueryParam(url, mode === "mobile" ? "mobile" : "desktop");

  const baseEmbedUrl = sanitizeEmbedUrl(resolvedEmbedUrl);
  let previewMode = "desktop";

  const setPreviewMode = (mode, persist = true) => {
    previewMode = mode === "mobile" ? "mobile" : "desktop";
    document.body.classList.toggle(
      "is-preview-mobile",
      previewMode === "mobile"
    );
    previewButtons.forEach((button) => {
      const isActive = button.dataset.preview === previewMode;
      button.classList.toggle("is-active", isActive);
    });
    if (persist) {
      try {
        localStorage.setItem(previewStorageKey, previewMode);
      } catch (error) {
        // no-op
      }
    }

    if (previewLabel) {
      previewLabel.textContent =
        previewMode === "mobile" ? "Mobile" : "Desktop";
    }
    if (previewSize) {
      previewSize.textContent = previewSizeValue;
    }

    const nextEmbedUrl = buildEmbedUrl(baseEmbedUrl, previewMode);
    if (nextEmbedUrl && iframe.src !== nextEmbedUrl) {
      iframe.src = nextEmbedUrl;
    }
    if (mapUrlLabel && nextEmbedUrl) {
      mapUrlLabel.textContent = nextEmbedUrl;
    }
  };

  try {
    const stored = localStorage.getItem(previewStorageKey);
    if (stored) previewMode = stored;
  } catch (error) {
    // no-op
  }

  setPreviewMode(previewMode, false);

  let autoState = "embed";
  let manualState = null;

  const setStickyOffsets = () => {
    const header = document.querySelector(".site-header");
    const promo = document.querySelector(".promo-banner");
    if (!header || !promo) {
      return;
    }
    const headerHeight = header.offsetHeight || 0;
    const promoHeight = promo.offsetHeight || 0;
    document.documentElement.style.setProperty(
      "--header-offset",
      `${headerHeight}px`
    );
    document.documentElement.style.setProperty(
      "--sticky-offset",
      `${headerHeight + promoHeight + 16}px`
    );
  };

  const updateState = (reason) => {
    const state = manualState || autoState;
    mapWrapper.dataset.state = state;

    if (status) {
      const source = manualState ? "Manual" : "Auto";
      const suffix = reason ? ` (${reason})` : "";
      status.textContent = `State: ${source} ${state}${suffix}`;
    }
  };

  const detectBlocked = () => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc || !doc.location) {
        return false;
      }
      return doc.location.href === "about:blank";
    } catch (error) {
      return false;
    }
  };

  const loadTimer = window.setTimeout(() => {
    autoState = "placeholder";
    updateState("timeout");
  }, 4000);

  iframe.addEventListener("load", () => {
    window.clearTimeout(loadTimer);
    autoState = detectBlocked() ? "placeholder" : "embed";
    updateState(autoState === "embed" ? "loaded" : "blocked");
  });

  iframe.addEventListener("error", () => {
    window.clearTimeout(loadTimer);
    autoState = "placeholder";
    updateState("error");
  });

  toggleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      manualState = button.dataset.mode || "embed";
      updateState("toggle");
    });
  });

  previewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setPreviewMode(button.dataset.preview || "desktop");
    });
  });

  setStickyOffsets();
  window.addEventListener("resize", setStickyOffsets);

  updateState("init");
})();
