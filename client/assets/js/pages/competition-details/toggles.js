export function initToggles() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sel = btn.getAttribute('data-target');
      const target = document.querySelector(sel);
      const altSel = btn.getAttribute('data-alt');
      const alt = altSel ? document.querySelector(altSel) : null;
      if (!target) return;

      // If we have an "alt" container, toggle between them (hide body, show collapsed bar)
      if (alt) {
        const hideBody = !target.classList.contains('is-hidden');
        target.classList.toggle('is-hidden', hideBody);
        alt.classList.toggle('is-hidden', !hideBody);
        btn.textContent = hideBody ? 'Show Sections' : 'Hide Sections';
        const wrap = btn.closest('.promo-pros-wrap');
        if (wrap) wrap.classList.toggle('is-collapsed', hideBody);
        return;
      }

      // Collapse height but keep width/slot
      if (sel === '#promoHoaContent' || sel === '#prosConsContent') {
        target.classList.toggle('collapse-height');
        // If you want the little fade:
        target.classList.toggle('fade');
        btn.textContent = target.classList.contains('collapse-height') ? 'Show' : 'Hide';
      } else {
        // default behavior for any other targets
        target.classList.toggle('hidden');
        btn.textContent = target.classList.contains('hidden') ? 'Show' : 'Hide';
      }
    });
  });
}
