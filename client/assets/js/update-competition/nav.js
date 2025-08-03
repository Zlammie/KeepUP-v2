// public/assets/js/update-competition/nav.js
import { monthNames, now } from './data.js';

/** 6-month pill nav ending last month, marking that pill active. */
export function renderMonthNav(container) {
  container.innerHTML = '';
  const lastMonth   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const activeValue = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,'0')}`;

  for (let i = 6; i >= 1; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

    const li = document.createElement('li');
    li.className = 'nav-item';

    const a = document.createElement('a');
    a.className = `nav-link${val === activeValue ? ' active' : ''}`;
    a.href = '#';
    a.dataset.month = val;
    a.textContent = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;

    li.appendChild(a);
    container.appendChild(li);
  }
}

/** Wire clicks on the month pills. */
export function bindMonthNav(container, onSelect) {
  container.addEventListener('click', e => {
    const link = e.target.closest('a.nav-link');
    if (!link) return;
    e.preventDefault();
    container.querySelector('.active')?.classList.remove('active');
    link.classList.add('active');
    onSelect(link.dataset.month);
  });
}

/** Wire your section tabs (.nav-tabs → .section panels). */
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
