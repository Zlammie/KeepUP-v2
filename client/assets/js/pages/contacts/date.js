// /assets/js/contacts/date.js
export function formatDate(input) {
  if (!input) return '';
  const dateObj = new Date(input);
  if (isNaN(dateObj.getTime())) return ''; // guard against bad values

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = String(dateObj.getFullYear()).slice(-2); // yy

  return `${month}/${day}/${year}`; // mm/dd/yy
}
