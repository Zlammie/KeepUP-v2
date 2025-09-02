(function () {
  function normalizeKey(raw) {
    if (!raw) return 'new';
    return String(raw).trim().toLowerCase()
      .replace(/[_\s]+/g, '-')       // spaces/underscores -> dashes
      .replace(/[^\w-]/g, '');       // guard against stray chars
  }

  function formatLabel(raw) {
    if (!raw) return 'New';
    return String(raw)
      .replace(/[_-]+/g, ' ')        // dashes/underscores -> spaces
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, c => c.toUpperCase()); // Title Case
  }

  function applyBadge(el, raw) {
    const key = normalizeKey(raw);
    const label = formatLabel(raw);

    // wipe previous status modifier classes
    el.className = (el.className || '')
      .split(' ')
      .filter(c => !/^status-badge$/.test(c) && !/^[-\w]+$/.test(c)) // keep non-simple classes
      .join(' ')
      .trim();

    // ensure base class present
    if (!/\bstatus-badge\b/.test(el.className)) {
      el.className = (el.className ? el.className + ' ' : '') + 'status-badge';
    }

    // add the status modifier class (matches your CSS like .status-badge.deal-lost)
    el.classList.add(key);

    // set the label
    el.textContent = label;
  }

  // expose globally
  window.StatusBadge = { normalizeKey, formatLabel, applyBadge };
})();

