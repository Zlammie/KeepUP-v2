export function initToggles() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sel = btn.getAttribute('data-target');
      const target = document.querySelector(sel);
      if (!target) return;

      // Collapse height but keep width/slot
      if (sel === '#promoHoaContent' || sel === '#prosConsContent') {
        target.classList.toggle('collapse-height');
        // If you want the little fade:
        target.classList.toggle('fade');
        btn.textContent = target.classList.contains('collapse-height') ? 'Show' : 'Hide';
      } else {
        // default behavior for any other targets
        target.classList.toggle('hidden');
        btn.textContent = target.classList.contains('hidden') ? 'Show' : 'Hide';
      }
    });
  });
}