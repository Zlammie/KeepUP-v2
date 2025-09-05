// assets/js/contact-details/ui.js
export function initMiscUI() {
  const panel   = document.getElementById('more-info-panel');
  const toggle  = document.getElementById('more-info-toggle');
  const body    = document.getElementById('more-info-body');
  const triangle = toggle?.querySelector('.triangle');

  if (!panel || !toggle || !body) return;

  // ensure closed by default (only the blue bar peeks in)
  panel.classList.remove('open');

  function apply() {
    const isOpen = panel.classList.contains('open');
    // Let CSS handle display/width; keep ARIA + triangle synced
    toggle.setAttribute('aria-expanded', String(isOpen));
    if (triangle) triangle.textContent = isOpen ? '▼' : '▶';
  }

  toggle.addEventListener('click', () => {
    panel.classList.toggle('open');
    apply();
  });

  apply();
}

function initMoreInfoPanel() {
  const panel  = document.getElementById('more-info-panel');
  const toggle = document.getElementById('more-info-toggle');
  const body   = document.getElementById('more-info-body');
  if (!panel || !toggle || !body) return;

  // A11y
  toggle.setAttribute('role', 'button');
  toggle.setAttribute('tabindex', '0');
  toggle.setAttribute('aria-controls', 'more-info-body');
  const triangle = toggle.querySelector('.triangle');

  // Apply current state to UI
  function apply() {
    const isCollapsed = panel.classList.contains('collapsed');
    body.style.display = isCollapsed ? 'none' : 'block';
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    if (triangle) triangle.textContent = isCollapsed ? '▶' : '▼';
  }
  apply();

  function onToggle() {
    panel.classList.toggle('collapsed');
    apply();
  }

  toggle.addEventListener('click', onToggle);
  toggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  });
}

function initTodoPanel() {
  const btn   = document.getElementById('todo-toggle');
  const panel = document.getElementById('todo-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    btn.textContent = panel.classList.contains('collapsed') ? '▸ Tasks' : '▾ Tasks';
  });
}
