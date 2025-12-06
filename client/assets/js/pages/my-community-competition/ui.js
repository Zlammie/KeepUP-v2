// client/assets/js/my-community-competition/ui.js
import { leftSidebar, rightTop, graphMount, sqftMonthFilter, sqftMonthSelect } from './dom.js';
import { currentChart, setCurrentChart } from './state.js';

export function enableUI(enabled) {
  const method = enabled ? 'remove' : 'add';
  leftSidebar?.classList[method]('opacity-50');
  rightTop?.classList[method]('opacity-50');
  leftSidebar?.setAttribute('aria-disabled', enabled ? 'false' : 'true');
  rightTop?.setAttribute('aria-disabled', enabled ? 'false' : 'true');
}

export function clearGraph() {
  graphMount.innerHTML = '';
  if (currentChart) {
    currentChart.destroy();
    setCurrentChart(null);
  }
}

export function mountInfo(text) {
  graphMount.innerHTML = `<div class="p-3 text-muted">${text}</div>`;
}

export function hideSqftFilter() {
  sqftMonthFilter?.classList.add('is-hidden');
}

export function setSqftFilter(options = [], selectedValue = '') {
  if (!sqftMonthFilter || !sqftMonthSelect) return;

  const hasOptions = Array.isArray(options) && options.length > 0;
  if (!hasOptions) {
    sqftMonthSelect.innerHTML = '';
    hideSqftFilter();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt?.value ?? '';
    option.textContent = opt?.label ?? opt?.value ?? '';
    fragment.appendChild(option);
  }

  sqftMonthSelect.innerHTML = '';
  sqftMonthSelect.appendChild(fragment);

  const targetValue = selectedValue ?? options[0]?.value ?? '';
  sqftMonthSelect.value = targetValue;
  if (sqftMonthSelect.value !== targetValue && sqftMonthSelect.options.length) {
    sqftMonthSelect.selectedIndex = 0;
  }

  sqftMonthFilter.classList.remove('is-hidden');
}

export function setSqftFilterDisabled(disabled) {
  if (!sqftMonthSelect) return;
  sqftMonthSelect.disabled = Boolean(disabled);
}

// wireTabs defers graph drawing to charts.js to avoid circular deps.
// We pass in callbacks to draw.
export function wireTabs(drawers, getCommunityId) {
  const tabs = Array.from(document.querySelectorAll('.tab-btn'));
  tabs.forEach(btn => {
    btn.addEventListener('click', async () => {
      tabs.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      const id = getCommunityId();
      if (!id) { clearGraph(); return; }

      const tab = btn.dataset.tab;
      if (tab in drawers) {
        await drawers[tab](id);
      } else {
        clearGraph();
        mountInfo(`"${tab}" graph coming soon.`);
      }
    });
  });
}
