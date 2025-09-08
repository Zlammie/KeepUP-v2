// /assets/js/address-details/utils.js
export const debounce = (fn, ms = 300) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

export const formatDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const datePart = d.toLocaleDateString();
  const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: 'numeric' });
  return `${datePart} ${timePart}`;
};

export const toLocalInputDateTime = (value) => {
  if (!value) return '';
  // ISO 8601 trimmed for <input type="datetime-local">
  return new Date(value).toISOString().slice(0, 16);
};
