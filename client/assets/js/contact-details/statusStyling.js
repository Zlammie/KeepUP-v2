// Status dropdown background
  const statusSelect = document.getElementById('status');
  const statusBackgrounds = {
      'new': '#0E79B2',
      'be-back': '#FFB347',
      'cold': '#4682B4',
      'target': '#6A0DAD',
      'possible': '#B57EDC',
      'negotiating': '#3CB371',
      'purchased': '#2E8B57',
      'closed': '#495057',
      'not-interested': '#FF6F61',
      'deal-lost': '#B22222',
      'bust': '#8B0000'
  };



function formatStatusLabel(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/[-_]+/g, ' ')          // dashes/underscores → spaces
    .replace(/\s+/g, ' ')            // collapse spaces
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()); // title case
}
window.formatStatusLabel = formatStatusLabel;

  function updateStatusBackground() {
    const selectedValue = statusSelect.value;
    const bg = statusBackgrounds[selectedValue] || 'white';
    statusSelect.style.backgroundColor = bg;
  }

  statusSelect.addEventListener('mousedown', () => {
    statusSelect.style.backgroundColor = 'white';
  });

  window.addEventListener('pointerdown', (e) => {
    if (!statusSelect.contains(e.target)) {
      setTimeout(updateStatusBackground, 50);
    }
  });

  statusSelect.addEventListener('change', updateStatusBackground);