import { $, $$ } from '../../core/dom.js';
import { debounce } from '../../core/async.js';

export { $, $$, debounce };

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}
