// Table rendering + result count

import { dom } from './domCache.js';
import { escapeHtml } from './utils.js';
import { formatPhoneDisplay } from '../shared/phone.js';

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

// Use generic title-case; remove the "Purchase" override
function displayStatus(raw) {
  const key = normalizeStatus(raw);
  if (!key) return '--';
  if (key === 'not-interested') return 'Not Interested';
  if (key === 'deal-lost')      return 'Deal Lost';
  return titleizeFromKey(key);  // "purchased" -> "Purchased"
}

const LENDER_STATUS_META = {
  invite: { label: 'Invite', className: 'invite' },
  submittedapplication: { label: 'Submitted Application', className: 'submittedapplication' },
  submitteddocs: { label: 'Submitted Docs', className: 'submitteddocs' },
  missingdocs: { label: 'Missing Docs', className: 'missingdocs' },
  approved: { label: 'Approved', className: 'approved' },
  cannotqualify: { label: 'Cannot Qualify', className: 'cannotqualify' },
};

function normalizeLenderStatus(raw) {
  if (!raw) return '';
  return raw.toString().trim().toLowerCase().replace(/\s+/g, '');
}

function getLenderStatusMeta(raw) {
  const key = normalizeLenderStatus(raw);
  return key && LENDER_STATUS_META[key] ? { key, ...LENDER_STATUS_META[key] } : null;
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
  rows.forEach((c) => {
    const name = (c.firstName || c.lastName) ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : '(Unnamed Contact)';
    const phone = formatPhoneDisplay(c.phone || '') || 'N/A';
    const email = c.email || 'N/A';

    const statusKey = normalizeStatus(c.status);
    const statusLabel = displayStatus(c.status);
    const lenderMeta = getLenderStatusMeta(c.lenderStatus);

    const communities = Array.isArray(c.communities) ? c.communities.join(', ') : (c.communities || 'N/A');
    const owner = c.owner || 'N/A';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="/contact-details?id=${c._id}">${escapeHtml(name)}</a></td>
      <td>${escapeHtml(phone)}</td>
      <td>${escapeHtml(email)}</td>
      <td>
        <div class="status-duo">
          <div class="status-duo__item">
            <span class="status-duo__label">Contact Status</span>
            <span class="status-badge ${statusKey}">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="status-duo__item">
            <span class="status-duo__label">Lender Invite</span>
            ${
              lenderMeta
                ? `<span class="lender-status-badge ${lenderMeta.className}">${escapeHtml(lenderMeta.label)}</span>`
                : `<span class="status-duo__value status-duo__value--muted">Not sent</span>`
            }
          </div>
        </div>
      </td>
      <td>${escapeHtml(communities)}</td>
      <td>${escapeHtml(owner)}</td>
    `;
    tbody.appendChild(tr);
  });
}
