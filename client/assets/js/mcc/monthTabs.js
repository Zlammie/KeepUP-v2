// client/assets/js/mcc/monthTabs.js
const WINDOW_SIZE = 6;
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const keyFromDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const dateFromKey = (key) => {
  const [y, m] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
};
const addMonths = (date, offset) => new Date(date.getFullYear(), date.getMonth() + offset, 1);

function buildWindowKeys(anchorKey) {
  const anchorDate = dateFromKey(anchorKey);
  const keys = [];
  for (let i = WINDOW_SIZE - 1; i >= 0; i--) {
    keys.push(keyFromDate(addMonths(anchorDate, -i)));
  }
  return keys;
}

export function monthTabs() {
  const host = document.getElementById('monthNav');
  if (!host) return { init: () => {}, getSelectedMonth: () => null, subscribe: () => {} };

  const now = new Date();
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const MAX_ALLOWED_KEY = keyFromDate(lastMonthDate);

  const subscribers = [];
  let anchorKey = MAX_ALLOWED_KEY;
  let currentKey = MAX_ALLOWED_KEY;

  function applyActive(selectedKey) {
    const pills = host.querySelectorAll('.month-list a.nav-link');
    pills.forEach((link) => {
      const isActive = link.dataset.month === selectedKey;
      link.classList.toggle('active', isActive);
      link.setAttribute('aria-selected', isActive ? 'true' : 'false');
      link.setAttribute('tabindex', isActive ? '0' : '-1');
    });
    host.setAttribute('data-selected-month', selectedKey || '');
  }

  function render() {
    host.classList.add('w-100');
    host.innerHTML = `
      <div class="month-nav-wrap d-flex justify-content-center align-items-center gap-2 w-100">
        <button type="button" class="btn btn-light btn-sm nav-prev" aria-label="Previous months">
          <span aria-hidden="true">&#8249;</span>
        </button>
        <ul class="nav nav-pills justify-content-center flex-wrap month-list mb-0 ms-3 gap-3"></ul>
        <button type="button" class="btn btn-light btn-sm nav-next" aria-label="Next months">
          <span aria-hidden="true">&#8250;</span>
        </button>
        <button type="button" class="btn btn-outline-secondary btn-sm nav-latest ms-2">Latest</button>
      </div>
    `;

    const list = host.querySelector('.month-list');
    const windowKeys = buildWindowKeys(anchorKey);

    // keep the active month inside the visible window (default to the newest/right-most)
    if (!windowKeys.includes(currentKey)) {
      currentKey = windowKeys[windowKeys.length - 1];
    }

    list.innerHTML = windowKeys
      .map((key) => {
        const date = dateFromKey(key);
        const label = `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
        const activeClass = key === currentKey ? ' active' : '';
        return `<li class="nav-item"><a href="#" class="nav-link${activeClass}" data-month="${key}">${label}</a></li>`;
      })
      .join('');

    host.setAttribute('role', 'tablist');

    const nextBtn = host.querySelector('.nav-next');
    if (nextBtn) nextBtn.disabled = anchorKey === MAX_ALLOWED_KEY;

    applyActive(currentKey);
  }

  function notify() {
    const selected = currentKey;
    subscribers.forEach((fn) => {
      try { fn(selected); }
      catch (err) { console.error(err); }
    });
  }

  function shiftWindow(offset) {
    const candidate = keyFromDate(addMonths(dateFromKey(anchorKey), offset));
    anchorKey = candidate > MAX_ALLOWED_KEY ? MAX_ALLOWED_KEY : candidate;
    currentKey = anchorKey;
    render();
    notify();
  }

  host.addEventListener('click', (event) => {
    const pill = event.target.closest('.month-list a.nav-link');
    if (pill) {
      event.preventDefault();
      currentKey = pill.dataset.month;
      applyActive(currentKey);
      notify();
      return;
    }

    const prevBtn = event.target.closest('button.nav-prev');
    if (prevBtn) {
      event.preventDefault();
      shiftWindow(-1);
      return;
    }

    const nextBtn = event.target.closest('button.nav-next');
    if (nextBtn && !nextBtn.disabled) {
      event.preventDefault();
      shiftWindow(1);
      return;
    }

    const latestBtn = event.target.closest('button.nav-latest');
    if (latestBtn) {
      event.preventDefault();
      anchorKey = MAX_ALLOWED_KEY;
      currentKey = MAX_ALLOWED_KEY;
      render();
      notify();
    }
  });

  host.addEventListener('keydown', (event) => {
    const active = host.querySelector('.month-list a.nav-link.active');
    if (!active) return;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const pills = Array.from(host.querySelectorAll('.month-list a.nav-link'));
      const index = pills.indexOf(active);
      const nextIndex = event.key === 'ArrowLeft' ? index - 1 : index + 1;

      if (nextIndex < 0) {
        host.querySelector('.nav-prev')?.click();
      } else if (nextIndex >= pills.length) {
        const nextBtn = host.querySelector('.nav-next');
        if (nextBtn && !nextBtn.disabled) nextBtn.click();
      } else {
        pills[nextIndex]?.click();
      }
    }
  });

  function init() {
    anchorKey = MAX_ALLOWED_KEY;
    currentKey = MAX_ALLOWED_KEY;
    render();
    notify();
  }

  function getSelectedMonth() {
    return currentKey;
  }

  function subscribe(fn) {
    if (typeof fn === 'function') subscribers.push(fn);
  }

  return { init, getSelectedMonth, subscribe };
}
