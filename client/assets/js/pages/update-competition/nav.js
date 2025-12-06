// public/assets/js/update-competition/nav.js
import { monthNames, now } from './data.js';

// ----- module-scope window state (right-most pillar in the 6-month window) -----
const WINDOW_SIZE = 6;
let monthAnchorKey = null; // right-most month shown

// ----- date helpers -----
const keyFromDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const dateFromKey = key => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
};
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

// stop at current month - 1
const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const MAX_ALLOWED_KEY = keyFromDate(lastMonthDate);

function buildWindowKeys(anchorKey) {
  const anchor = dateFromKey(anchorKey);
  const keys = [];
  for (let i = WINDOW_SIZE - 1; i >= 0; i--) {
    keys.push(keyFromDate(addMonths(anchor, -i)));
  }
  return keys;
}

/** 6-month pill nav ending last month (right-most), with arrows; active = right-most. */
export function renderMonthNav(container) {
  container.classList.add('w-100'); // let it span the row
  if (!monthAnchorKey) monthAnchorKey = MAX_ALLOWED_KEY;

  // build chrome
  container.innerHTML = `
    <div class="month-nav-wrap d-flex justify-content-center align-items-center gap-2 w-100">
      <button type="button" class="btn btn-light btn-sm nav-prev" aria-label="Previous month">‹</button>
      <ul class="nav nav-pills justify-content-center flex-wrap month-list mb-0 ms-3 gap-3"></ul>
      <button type="button" class="btn btn-light btn-sm nav-next" aria-label="Next month">›</button>
      <button type="button" class="btn btn-outline-secondary btn-sm nav-latest ms-2">Latest</button>
    </div>
  `;

  const list = container.querySelector('.month-list');
  const nextBtn = container.querySelector('.nav-next');

  // render 6 months ending at anchor
  const keys = buildWindowKeys(monthAnchorKey);
  const activeValue = monthAnchorKey; // right-most is active
  list.innerHTML = keys.map(k => {
    const d = dateFromKey(k);
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    const active = k === activeValue ? ' active' : '';
    return `<li class="nav-item"><a href="#" class="nav-link${active}" data-month="${k}">${label}</a></li>`;
  }).join('');

  // clamp forward
  nextBtn.disabled = (monthAnchorKey === MAX_ALLOWED_KEY);
    // --- accessibility + titles ---
  const prevBtn = container.querySelector('.nav-prev');
  const latestBtn = container.querySelector('.nav-latest');
  const pills = container.querySelectorAll('.month-list a.nav-link');

  if (prevBtn)   prevBtn.title   = 'Previous months';
  if (nextBtn)   nextBtn.title   = nextBtn.disabled ? 'Latest window' : 'Next months';
  if (latestBtn) latestBtn.title = 'Jump to latest';

  container.setAttribute('role', 'tablist');
  pills.forEach(a => {
    const isActive = a.classList.contains('active');
    a.setAttribute('role', 'tab');
    a.setAttribute('aria-selected', isActive ? 'true' : 'false');
    a.setAttribute('tabindex', isActive ? '0' : '-1');
  });
}

/** Wire clicks on the month pills and the prev/next arrows. */
export function bindMonthNav(container, onSelect) {
  // Clicks: pills + arrows
  container.addEventListener('click', e => {
    // month pill click
    const link = e.target.closest('a.nav-link');
    if (link) {
      e.preventDefault();
      const pills = container.querySelectorAll('.month-list a.nav-link');
      pills.forEach(p => {
        const isActive = p === link;
        p.classList.toggle('active', isActive);
        p.setAttribute('aria-selected', isActive ? 'true' : 'false');
        p.setAttribute('tabindex', isActive ? '0' : '-1');
      });
      onSelect?.(link.dataset.month);
      return;
    }

    // previous arrow: shift window left one month
    const prev = e.target.closest('button.nav-prev');
    if (prev) {
      const anchorDate = dateFromKey(monthAnchorKey || MAX_ALLOWED_KEY);
      monthAnchorKey = keyFromDate(addMonths(anchorDate, -1));
      renderMonthNav(container);
      // auto-select rightmost (newest) after shifting
      const last = container.querySelector('a.nav-link:last-of-type');
      last?.click();
      return;
    }

    // next arrow: shift window right one month (clamped)
    const next = e.target.closest('button.nav-next');
    if (next) {
      const anchorDate = dateFromKey(monthAnchorKey || MAX_ALLOWED_KEY);
      const candidate = keyFromDate(addMonths(anchorDate, 1));
      monthAnchorKey = (candidate > MAX_ALLOWED_KEY) ? MAX_ALLOWED_KEY : candidate;
      renderMonthNav(container);
      const last = container.querySelector('a.nav-link:last-of-type');
      last?.click();
      return;
    }

          // latest: jump to current month (cap) and select that exact month
      const latest = e.target.closest('button.nav-latest');
      if (latest) {
        e.preventDefault();
        monthAnchorKey = MAX_ALLOWED_KEY;   // move 6-month window so rightmost = currentMonth-1
        renderMonthNav(container);          // rebuild the pills

        // explicitly select the rightmost/capped month (e.g., "2025-08")
        const target = container.querySelector(
          `.month-list a.nav-link[data-month="${MAX_ALLOWED_KEY}"]`
        ) || container.querySelector('.month-list a.nav-link:last-of-type');

        target?.click();                    // triggers your existing onSelect(month)
        return;
      }
  });

  // Keyboard navigation across visible pills (add once)
  container.addEventListener('keydown', e => {
    const active = container.querySelector('.month-list a.nav-link.active');
    if (!active) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const pills = Array.from(container.querySelectorAll('.month-list a.nav-link'));
      const idx = pills.indexOf(active);
      const nextIdx = e.key === 'ArrowLeft' ? idx - 1 : idx + 1;

      if (nextIdx < 0) {
        container.querySelector('.nav-prev')?.click();
      } else if (nextIdx >= pills.length) {
        const nextBtn = container.querySelector('.nav-next');
        if (!nextBtn?.disabled) nextBtn?.click();
      } else {
        pills[nextIdx]?.click();
      }
    }
  });
}


/** Wire your section tabs (.nav-tabs → .section panels). (unchanged) */
export function bindSectionNav(container) {
  container.addEventListener('click', e => {
    const link = e.target.closest('a.nav-link');
    if (!link) return;
    e.preventDefault();
    // swap active on the tab
    container.querySelector('.active')?.classList.remove('active');
    link.classList.add('active');
    // show/hide the matching section
    document
      .querySelectorAll('.section')
      .forEach(sec =>
        sec.classList.toggle('d-none', sec.dataset.sectionContent !== link.dataset.section)
      );
  });
}
