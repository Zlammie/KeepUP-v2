// utils.js (module-safe)
export function debounce(fn, wait = 400) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

export function parseCurrency(value) {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const cleaned = str.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function formatCurrency(value) {
  const numeric = parseCurrency(value);
  if (numeric == null) return '';
  return numeric.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  });
}

export const fmt = {
  money(n) {
    if (n == null || n === '') return '';
    const v = Number(n);
    return Number.isFinite(v)
      ? v.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
      : '';
  }
};

export function readMoney(v) {
  return v == null ? '' : String(v).replace(/[^\d.-]/g, '');
}

export function parseMoney(v) {            // optional helper
  const s = readMoney(v);
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function readDate(v) {
  if (!v) return '';
  return (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date(v).toISOString().slice(0,10));
}

export function fmtDate(v) {
  return v ? new Date(v).toLocaleDateString() : '—';
}

export function safe(v) {
  return (v ?? '—');
}
