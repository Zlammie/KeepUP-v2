// assets/js/competition-details/boot.js
export function readBoot() {
  const el = document.getElementById('__COMPETITION_DATA__');
  try {
    return JSON.parse(el?.textContent || '{}');
  } catch (e) {
    console.error('Failed to parse __COMPETITION_DATA__', e);
    return {};
  }
}