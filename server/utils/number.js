const numOrNull = v => (v === '' || v == null ? null : Number(v));
const toNum = v => (v == null || v === '' ? 0 : Number(v));
module.exports = { numOrNull, toNum };
