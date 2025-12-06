// utils.js (module-safe)
import { debounce } from '../../core/async.js';
import { parseCurrency, formatCurrency } from '../../core/currency.js';

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
  return v ? new Date(v).toLocaleDateString() : 'N/A';
}

export function safe(v) {
  return (v ?? 'N/A');
}
