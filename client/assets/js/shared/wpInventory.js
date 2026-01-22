const getQueryParam = (key) => {
  if (typeof window === 'undefined') return '';
  const value = new URLSearchParams(window.location.search).get(key);
  return String(value || '').trim();
};

export const addressToWpSlug = (address) => {
  if (!address) return '';
  let text = String(address).trim().toLowerCase();
  if (!text) return '';
  text = text.replace(/&/g, ' and ');
  text = text.replace(/[.,]/g, '');
  text = text.replace(/#/g, '');
  text = text.replace(/[^a-z0-9\s-]/g, '');
  text = text.replace(/\s+/g, '-');
  text = text.replace(/-+/g, '-');
  text = text.replace(/^-+|-+$/g, '');
  return text;
};

export const buildWpInventoryUrl = ({ wpCommunitySlug, address }) => {
  const community = String(wpCommunitySlug || '').trim();
  const addressSlug = addressToWpSlug(address);
  if (!community || !addressSlug) return '';
  return `https://grenadierhomes.com/communities/${community}/${addressSlug}/`;
};

export const resolveWpCommunitySlug = (fallbackSlug) => {
  const override = getQueryParam('wpCommunitySlug');
  if (override) return override.toLowerCase();
  return String(fallbackSlug || '').trim().toLowerCase();
};

export const hasLinkedHomeRecord = (entry) => {
  if (!entry) return false;
  return Boolean(
    entry.listingUrl ||
    entry.listingId ||
    entry.homeId ||
    entry.inventoryId ||
    entry.lotId ||
    entry.floorPlanName ||
    entry.floorPlanNumber ||
    entry.price
  );
};

export const hasViewHomeLink = (entry) => {
  if (!entry) return false;
  if (entry.hasViewHomeLink === true) return true;
  if (entry.hasLink === true) return true;
  if (entry.viewHomeEnabled === true) return true;
  return false;
};

export const isSpecHome = (entry) => {
  if (!entry) return false;
  if (entry.isSpec === true) return true;
  const candidates = [
    entry.status,
    entry.inventoryType,
    entry.inventoryStatus,
    entry.generalStatus,
    entry.salesStatus
  ];
  return candidates.some((value) => {
    if (!value) return false;
    const text = String(value).toLowerCase();
    return text.includes('spec') || text.includes('inventory');
  });
};

export const shouldShowWpUrlHint = () => getQueryParam('wpDebug') === '1';

if (shouldShowWpUrlHint()) {
  console.debug('[wp-slug]', {
    input: '510 Sherwood Drive',
    output: addressToWpSlug('510 Sherwood Drive'),
    unit: addressToWpSlug('7120 Park Blvd #1204'),
    punctuation: addressToWpSlug('1234 Main St., Apt #5B')
  });
}

// Manual checks:
// - Select lot with "Has link" checked + address "510 Sherwood Drive" => "View Home" visible + opens correct WP URL.
// - Select lot without "Has link" => "View Home" hidden.
// - Select lot with punctuation => slug looks correct.
