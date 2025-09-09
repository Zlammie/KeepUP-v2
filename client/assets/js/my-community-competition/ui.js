// client/assets/js/my-community-competition/ui.js
import { leftSidebar, rightTop, graphMount } from './dom.js';
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
