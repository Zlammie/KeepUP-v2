// client/assets/js/my-community-competition/toggles.js
export function setupSectionToggles() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;

    const selector = btn.getAttribute('data-target');
    if (!selector) return;

    const content = document.querySelector(selector);
    if (!content) return;

    const hidden = content.classList.toggle('is-hidden');
    btn.textContent = hidden ? 'Show' : 'Hide';
    btn.setAttribute('aria-expanded', String(!hidden));
    content.setAttribute('aria-hidden', String(hidden));
    try { localStorage.setItem(`mcc:toggle:${selector}`, hidden ? 'hidden' : 'shown'); } catch (_) {}
  });

  document.querySelectorAll('.toggle-btn[data-target]').forEach((btn) => {
    const selector = btn.getAttribute('data-target');
    const content = document.querySelector(selector);
    if (!content) return;

    let saved = null;
    try { saved = localStorage.getItem(`mcc:toggle:${selector}`); } catch (_) {}
    const shouldHide = saved === 'hidden';
    content.classList.toggle('is-hidden', shouldHide);

    btn.textContent = shouldHide ? 'Show' : 'Hide';
    btn.setAttribute('aria-controls', selector.replace('#', ''));
    btn.setAttribute('aria-expanded', String(!shouldHide));
    content.setAttribute('aria-hidden', String(shouldHide));
    if (!content.hasAttribute('role')) content.setAttribute('role', 'region');
  });
}
