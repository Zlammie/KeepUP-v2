export const parseCurrency = (value) => {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str) return null;
  const cleaned = str.replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

export const formatCurrency = (value, { currency = 'USD', maxFraction = 0 } = {}) => {
  const numeric = parseCurrency(value);
  if (numeric == null) return '';
  return numeric.toLocaleString(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: maxFraction
  });
};
