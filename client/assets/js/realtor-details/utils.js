// Small helpers shared across modules

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

export function debounce(fn, ms = 200) {
  let t; 
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
