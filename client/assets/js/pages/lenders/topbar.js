// /assets/js/lenders/topbar.js
export function initLendersTopBar(lenders) {
  // total
  const totalEl = document.getElementById('lenderTotal');
  if (totalEl) totalEl.textContent = lenders.length;

  // counts (placeholders for now)
  const setCount = (key, val) => {
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = val;
  };
  setCount('all', lenders.length);
  setCount('has-invited', 0);
  setCount('purchased-not-approved', 0);
  setCount('has-purchased', 0);

  // prepare handlers (no-op functionality for now)
  const filterBox = document.getElementById('lenderFilters');
  filterBox?.addEventListener('click', (e) => {
    const btn = e.target.closest('.status-pill');
    if (!btn) return;
    filterBox.querySelectorAll('.status-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // TODO: apply filtering here later
    // console.log('filter ->', btn.dataset.filter);
  });

  const searchEl = document.getElementById('lenderSearch');
  let t = null;
  searchEl?.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const q = searchEl.value.trim();
      // TODO: apply search filtering here later
      // console.log('search ->', q);
    }, 200);
  });
}
