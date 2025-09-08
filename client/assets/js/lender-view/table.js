import { dom } from './domCache.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';

// ----- Date helpers (America/Chicago) -----
const TZ = 'America/Chicago';

function parseDate(raw) {
  if (raw == null) return null;

  // Already a Date?
  if (raw instanceof Date) return isNaN(raw) ? null : raw;

  // Numbers (epoch ms or sec)
  if (typeof raw === 'number') {
    const ms = raw < 1e12 ? raw * 1000 : raw;  // treat small numbers as seconds
    const d = new Date(ms);
    return isNaN(d) ? null : d;
  }

  // Numeric strings => epoch
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    const ms = n < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return isNaN(d) ? null : d;
  }

  // ISO / general string
  const d = new Date(String(raw));
  return isNaN(d) ? null : d;
}

function formatDateValue(raw, { includeTime = false } = {}) {
  const d = parseDate(raw);
  if (!d) return 'N/A';

  if (includeTime) {
    return d.toLocaleString('en-US', {
      timeZone: TZ,
      month: '2-digit', day: '2-digit', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    });
  }

  return d.toLocaleDateString('en-US', {
    timeZone: TZ,
    month: '2-digit', day: '2-digit', year: 'numeric'
  });
}

// Map lender statuses to readable labels
const STATUS_LABELS = {
  'invite':'Invite',
  'sub-application':'Submitted Application',
  'sub-docs':'Submitted Docs',
  'missing-docs':'Missing Docs',
  'approved':'Approved',
  'cannot-qualify':'Cannot Qualify'
};
function norm(raw){
  const s=String(raw||'').trim().toLowerCase();
  if(!s) return '';
  if (s.includes('sub') && s.includes('application')) return 'sub-application';
  if (s.includes('sub') && s.includes('doc'))        return 'sub-docs';
  if (s.includes('missing') && s.includes('doc'))    return 'missing-docs';
  if (s.includes('cannot') && s.includes('qual'))    return 'cannot-qualify';
  return s;
}
function displayLabel(raw){ const key=norm(raw); return STATUS_LABELS[key] || (key ? key.replace(/\b\w/g,c=>c.toUpperCase()) : '—'); }

export function renderTable(rows){
  const tbody = dom.tableBody;
  if(!rows || rows.length===0){
    tbody.innerHTML = `<tr><td colspan="8">No contacts linked to this lender.</td></tr>`;
    return;
  }
  tbody.innerHTML = '';

  rows.forEach(contact=>{
    const name = (contact.firstName || contact.lastName) ? `${contact.firstName||''} ${contact.lastName||''}`.trim() : '(Unnamed)';
    const phone = contact.phone || 'N/A';
    const email = contact.email || 'N/A';
    const communities = Array.isArray(contact.communities) ? contact.communities.join(', ') : (contact.communities || 'N/A');
    const owner = contact.owner || 'N/A';

    // Find the lender entry that matches current lenderId
    const lenderInfo = (contact.lenders || []).find(l => l.lender && l.lender._id === state.lenderId);

    const status = displayLabel(lenderInfo?.status);
    const inviteDate   = formatDateValue(lenderInfo?.inviteDate);     // date only
    const approvedDate = formatDateValue(lenderInfo?.approvedDate); 

    // Also store a normalized status on the object for counting/filtering (topbar)
    contact._lenderStatus = norm(lenderInfo?.status || '');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="/contact-details.html?id=${escapeHtml(contact._id)}">${escapeHtml(name)}</a></td>
      <td>${escapeHtml(phone)}</td>
      <td>${escapeHtml(email)}</td>
      <td>${escapeHtml(communities)}</td>
      <td>${escapeHtml(owner)}</td>
      <td><span class="status-badge ${escapeHtml(contact._lenderStatus || '')}">${escapeHtml(status)}</span></td>
      <td>${escapeHtml(inviteDate)}</td>
      <td>${escapeHtml(approvedDate)}</td>
    `;
    tbody.appendChild(tr);
  });
}
