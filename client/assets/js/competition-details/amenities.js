// assets/js/competition-details/amenities.js
import { $, $$ } from './util.js';
import { putAmenities } from './api.js';

const AMENITIES = {
  "Pools": ["Pool", "Resort Style Pool", "Multiple Pools", "Lagoon", "Splash Pad"],
  "Indoor": ["Fitness Center", "Clubhouse", "Amenity Center"],
  "Recreational": ["Tennis", "Pickle Ball", "Volleyball", "Basketball", "Soccer", "Zip Line", "BBQ Grills"],
  "Parks & Trails": ["Playground", "Dog Park", "Community Park", "Green Spaces", "Gardens", "Hiking Trails", "Biking Trails"],
  "Misc.": ["Shops", "Community Cafe", "Golf Course", "Front Yard Maintenance"]
};

export function initAmenities(competitionId, savedGroups) {
  const openBtn  = $('#openAmenitiesBtn');
  const modal    = $('#amenitiesModal');
  const closeBtn = $('#closeAmenitiesModal');
  const form     = $('#amenitiesForm');
  const container = $('#amenitiesContainer');

  function render() {
    container.innerHTML = '';
    Object.entries(AMENITIES).forEach(([category, items]) => {
      const fs = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = category;
      fs.appendChild(legend);

      items.forEach(item => {
        const label = document.createElement('label');
        label.style.display = 'inline-block';
        label.style.marginRight = '0.75rem';
        label.innerHTML = `<input type="checkbox" name="${category}" value="${item}"> ${item}`;
        fs.appendChild(label);
      });

      container.appendChild(fs);
    });
  }

  function preload() {
    $$('#amenitiesForm input[type="checkbox"]').forEach(cb => cb.checked = false);
    (savedGroups || []).forEach(group => {
      (group.items || []).forEach(item => {
        const box = $(`#amenitiesForm input[name="${CSS.escape(group.category)}"][value="${CSS.escape(item)}"]`);
        if (box) box.checked = true;
      });
    });
  }

  openBtn?.addEventListener('click', () => {
    render();
    preload();
    modal.style.display = 'block';
  });
  closeBtn?.addEventListener('click', () => { modal.style.display = 'none'; });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const checked = $$('#amenitiesForm input[type="checkbox"]:checked');
    const grouped = {};
    checked.forEach(cb => {
      (grouped[cb.name] ||= []).push(cb.value);
    });
    const formatted = Object.entries(grouped).map(([category, items]) => ({ category, items }));

    try {
      await putAmenities(competitionId, formatted);
      modal.style.display = 'none';
      location.reload(); // simplest refresh for preview panel
    } catch (e) {
      console.error(e);
      alert('❌ Failed to save amenities');
    }
  });
}
