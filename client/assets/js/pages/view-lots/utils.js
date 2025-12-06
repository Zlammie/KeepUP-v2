// Small helpers reused across modules
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => (
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])
));

export const $ = sel => document.querySelector(sel);

// tiny helper to detect Mongo ObjectId-looking strings
const looksLikeObjectId = s => typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s);

export function displayPlan(fp, lot = {}) {
  if (!fp) return lot.planName ?? lot.floorPlanName ?? '';
  if (typeof fp === 'object') return fp.name ?? (lot.planName ?? lot.floorPlanName ?? '');
  if (typeof fp === 'string') return looksLikeObjectId(fp) ? (lot.planName ?? lot.floorPlanName ?? '') : fp;
  return '';
}

export function displayDate(d) {
  if (!d) return '';

  // Case 1: exact YYYY-MM-DD (date-only string)
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    // Render without timezone math (local calendar)
    return `${Number(m)}/${Number(day)}/${y}`;
  }

  // Case 2: ISO with midnight Z (e.g., 2024-12-02T00:00:00.000Z)
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(d)) {
    const head = d.slice(0, 10); // "YYYY-MM-DD"
    const [y, m, day] = head.split('-');
    return `${Number(m)}/${Number(day)}/${y}`;
  }

  // Fallback: let Date handle real datetimes
  const dt = new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleDateString();
}


export function displayDateTime(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt) ? '' : dt.toLocaleString();
}
