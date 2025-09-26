// client/assets/js/mcc/monthTabs.js
export function monthTabs() {
  const nav = document.getElementById('monthNav');
  if (!nav) return { init: () => {}, getSelectedMonth: () => null, subscribe: () => {} };

  const NUM_MONTHS = 6;
  const subs = [];
  const keyOf   = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const labelOf = (d) => d.toLocaleString(undefined, { month: 'short', year: 'numeric' });

  function setActive(a) {
    nav.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    a.classList.add('active');
  }
  function getSelectedMonth() {
    const a = nav.querySelector('.nav-link.active');
    return a ? a.dataset.month : null;
  }
  function notify() {
    const m = getSelectedMonth();
    subs.forEach(fn => { try { fn(m); } catch(e){ console.error(e); } });
  }
  function build() {
    nav.innerHTML = '';
    const today = new Date();
    const base  = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    for (let i = NUM_MONTHS - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const li = document.createElement('li'); li.className = 'nav-item';
      const a  = document.createElement('a');
      a.href = '#';
      a.className = `nav-link${i === 0 ? ' active' : ''}`;
      a.dataset.month = keyOf(d);
      a.textContent   = labelOf(d);
      a.addEventListener('click', (ev) => { ev.preventDefault(); setActive(a); notify(); });
      li.appendChild(a); nav.appendChild(li);
    }
    const scroller = nav.parentElement;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
    notify();
  }
  function subscribe(fn) { subs.push(fn); }
  function init() { build(); }

  return { init, getSelectedMonth, subscribe };
}
