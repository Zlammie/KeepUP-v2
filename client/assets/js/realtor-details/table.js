// Table rendering + result count

import { dom } from './domCache.js';
import { escapeHtml } from './utils.js';

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('negoti')) return 'negotiation';
  if (s.replace(/\s+/g, '-') === 'be-back' || (s.includes('be') && s.includes('back'))) return 'be-back';
  if (s.includes('not') && s.includes('interest')) return 'not-interested';
  if (s.includes('deal') && s.includes('lost')) return 'deal-lost';
  if (s === 'close' || s === 'closed') return 'closed';
  if (s === 'busted') return 'bust';
  if (s === 'purchase' || s === 'purchased') return 'purchased';
  return s;
}

function titleizeFromKey(key) {
  return key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ✅ Use generic title-case; remove the "Purchase" override
function displayStatus(raw) {
  const key = normalizeStatus(raw);
  if (!key) return '—';
  if (key === 'not-interested') return 'Not Interested';
  if (key === 'deal-lost')      return 'Deal Lost';
  return titleizeFromKey(key);  // "purchased" -> "Purchased"
}

export function updateResultCount(n, total) {
  dom.resultCount.textContent = `(${n} of ${total})`;
}

export function renderTable(rows) {
  const tbody = dom.tableBody;

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">No contacts linked to this realtor.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  rows.forEach(c => {
    const name = (c.firstName || c.lastName) ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : '(Unnamed Contact)';
    const phone = c.phone || 'N/A';
    const email = c.email || 'N/A';

    const statusKey   = normalizeStatus(c.status);
    const statusLabel = displayStatus(c.status);

    const communities = Array.isArray(c.communities) ? c.communities.join(', ') : (c.communities || 'N/A');
    const owner = c.owner || 'N/A';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="/contact-details?id=${c._id}">${escapeHtml(name)}</a></td>
      <td>${escapeHtml(phone)}</td>
      <td>${escapeHtml(email)}</td>
      <td>
        <span class="status-badge ${statusKey}">${escapeHtml(statusLabel)}</span>
      </td>
      <td>${escapeHtml(communities)}</td>
      <td>${escapeHtml(owner)}</td>
    `;
    tbody.appendChild(tr);
  });
}