export function showFlash(el, msg, type = 'success', timeout = 3000) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert alert-' + (type === 'success' ? 'success' : 'danger');
  el.classList.remove('d-none');
  if (timeout) setTimeout(() => el.classList.add('d-none'), timeout);
}

export function fmt(n) {
  if (n === '' || n === null || n === undefined) return '';
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : n;
}
