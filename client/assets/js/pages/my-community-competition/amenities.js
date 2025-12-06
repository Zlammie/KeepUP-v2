// client/assets/js/my-community-competition/amenities.js
import {
  amenityList,
  openAmenitiesBtn,
  amenitiesModal,
  closeAmenitiesModal,
  amenitiesForm,
  amenitiesContainer
} from './dom.js';
import { updateCommunityAmenities } from './api.js';
import { profileCache, setProfile } from './state.js';

const AMENITIES = {
  'Pools': ['Pool', 'Resort Style Pool', 'Multiple Pools', 'Lagoon', 'Splash Pad'],
  'Indoor': ['Fitness Center', 'Clubhouse', 'Amenity Center'],
  'Recreational': ['Tennis', 'Pickle Ball', 'Volleyball', 'Basketball', 'Soccer', 'Zip Line', 'BBQ Grills'],
  'Parks & Trails': ['Playground', 'Dog Park', 'Community Park', 'Green Spaces', 'Gardens', 'Hiking Trails', 'Biking Trails'],
  'Misc.': ['Shops', 'Community Cafe', 'Golf Course', 'Front Yard Maintenance']
};

const CATEGORY_ORDER = Object.keys(AMENITIES);

const normalizeAmenities = (input) => {
  if (!Array.isArray(input)) return [];
  const out = [];
  input.forEach(entry => {
    const category = typeof entry?.category === 'string' ? entry.category.trim() : '';
    const items = Array.isArray(entry?.items)
      ? Array.from(new Set(entry.items.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)))
      : [];
    if (!category || !items.length) return;
    out.push({ category, items });
  });
  return out;
};

export function applyAmenityChips(groups = []) {
  if (!amenityList) return;
  const normalized = normalizeAmenities(groups);
  amenityList.innerHTML = '';
  if (!normalized.length) {
    const li = document.createElement('li');
    li.className = 'chip chip--empty';
    li.textContent = 'No amenities selected';
    amenityList.appendChild(li);
    return;
  }

  normalized.forEach(group => {
    group.items.forEach(item => {
      const li = document.createElement('li');
      li.className = 'chip';
      li.textContent = item;
      amenityList.appendChild(li);
    });
  });
}

let initialized = false;
let currentCommunityId = null;
let currentAmenities = [];

function closeModal() {
  if (amenitiesModal) amenitiesModal.style.display = 'none';
}

function buildCategoryMap() {
  const map = new Map();
  CATEGORY_ORDER.forEach(cat => map.set(cat, [...AMENITIES[cat]]));
  currentAmenities.forEach(group => {
    const category = typeof group?.category === 'string' ? group.category.trim() : '';
    if (!category) return;
    const base = map.get(category) || [];
    const merged = Array.from(new Set([...base, ...(Array.isArray(group.items) ? group.items : [])].map(item => item.trim()).filter(Boolean)));
    map.set(category, merged);
  });
  return map;
}

function renderOptions() {
  if (!amenitiesContainer) return;
  amenitiesContainer.innerHTML = '';
  const categories = buildCategoryMap();
  const orderedCategories = Array.from(categories.entries()).sort(([a], [b]) => {
    const idxA = CATEGORY_ORDER.indexOf(a);
    const idxB = CATEGORY_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  orderedCategories.forEach(([category, items]) => {
    const fs = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = category;
    fs.appendChild(legend);

    items.forEach(item => {
      const label = document.createElement('label');
      label.style.display = 'inline-block';
      label.style.marginRight = '0.75rem';
      label.style.marginBottom = '0.35rem';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = category;
      input.value = item;
      label.appendChild(input);
      label.append(` ${item}`);
      fs.appendChild(label);
    });

    amenitiesContainer.appendChild(fs);
  });
}

function preloadSelections() {
  if (!amenitiesForm) return;
  const normalized = normalizeAmenities(currentAmenities);
  const map = new Map(normalized.map(group => [group.category, new Set(group.items)]));
  amenitiesForm.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    const categorySet = map.get(cb.name);
    cb.checked = categorySet ? categorySet.has(cb.value) : false;
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  if (!currentCommunityId || !amenitiesForm) return;

  const checked = Array.from(amenitiesForm.querySelectorAll('input[type="checkbox"]:checked'));
  const grouped = {};
  checked.forEach(cb => {
    (grouped[cb.name] ||= []).push(cb.value);
  });
  const formatted = Object.entries(grouped).map(([category, items]) => ({ category, items }));

  try {
    const result = await updateCommunityAmenities(currentCommunityId, formatted);
    currentAmenities = normalizeAmenities(result?.communityAmenities);
    applyAmenityChips(currentAmenities);
    if (profileCache) {
      setProfile({ ...profileCache, communityAmenities: currentAmenities });
    } else {
      setProfile({ communityAmenities: currentAmenities });
    }
    closeModal();
  } catch (err) {
    console.error(err);
    alert('Failed to save amenities.');
  }
}

export function initAmenities() {
  if (initialized) return;
  initialized = true;

  if (openAmenitiesBtn) openAmenitiesBtn.disabled = true;

  openAmenitiesBtn?.addEventListener('click', () => {
    if (!currentCommunityId) {
      alert('Select a community first.');
      return;
    }
    renderOptions();
    preloadSelections();
    amenitiesModal.style.display = 'block';
  });

  closeAmenitiesModal?.addEventListener('click', closeModal);
  amenitiesModal?.addEventListener('click', (event) => {
    if (event.target === amenitiesModal) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && amenitiesModal?.style.display === 'block') {
      closeModal();
    }
  });

  amenitiesForm?.addEventListener('submit', handleSubmit);

  window.addEventListener('mcc:profileLoaded', (event) => {
    currentCommunityId = event.detail?.communityId || null;
    const profileAmenities = Array.isArray(event.detail?.profile?.communityAmenities)
      ? event.detail.profile.communityAmenities
      : [];
    const communityAmenities = Array.isArray(event.detail?.community?.communityAmenities)
      ? event.detail.community.communityAmenities
      : [];
    currentAmenities = normalizeAmenities(profileAmenities.length ? profileAmenities : communityAmenities);
    if (openAmenitiesBtn) openAmenitiesBtn.disabled = !currentCommunityId;
    applyAmenityChips(currentAmenities);
  });

  applyAmenityChips(currentAmenities);
}
