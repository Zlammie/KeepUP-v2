// client/assets/js/mcc/tabs.js
import { qq } from './context.js';

export function wireTabs(defaultSection = 'metrics') {
  const links = qq('#sectionNav .nav-link');
  const sections = qq('.section');

  const activate = (section) => {
    if (!section) return;
    links.forEach(l => l.classList.toggle('active', l.dataset.section === section));
    sections.forEach(sec =>
      sec.classList.toggle('d-none', sec.getAttribute('data-section-content') !== section)
    );
    // persist + deep-link
    try {
      localStorage.setItem('mcc:lastTab', section);
      location.hash = section;
    } catch {}
  };

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      activate(link.dataset.section);
    });
  });

  // choose initial tab: URL hash > last used > pre-marked active > default > first
  const initial =
    (location.hash && location.hash.slice(1)) ||
    localStorage.getItem('mcc:lastTab') ||
    (links.find(l => l.classList.contains('active'))?.dataset.section) ||
    defaultSection ||
    links[0]?.dataset.section;

  activate(initial);
}
