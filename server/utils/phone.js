const { parsePhoneNumberFromString } = require('libphonenumber-js');

const DEFAULT_COUNTRY = (process.env.PHONE_DEFAULT_COUNTRY || 'US').toUpperCase();
const MAX_DIGITS_LENGTH = 15;

const toTrim = (value) => (value == null ? '' : String(value).trim());

function clipDigits(digits) {
  if (!digits) return '';
  if (digits.length <= MAX_DIGITS_LENGTH) return digits;
  return digits.slice(-MAX_DIGITS_LENGTH);
}

function parsePhone(value, options = {}) {
  const defaultCountry = (options.defaultCountry || DEFAULT_COUNTRY).toUpperCase();
  const raw = toTrim(value);
  if (!raw) {
    return { raw, e164: '', digits: null, valid: false };
  }

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(raw, defaultCountry);
  } catch (err) {
    parsed = null;
  }

  if (parsed && parsed.isValid()) {
    const e164 = parsed.number; // Already in E.164 format
    const digits = String(parsed.nationalNumber || '');
    return { raw, e164, digits: digits || null, valid: true };
  }

  const digitsOnly = clipDigits(raw.replace(/\D+/g, ''));
  return {
    raw,
    e164: '',
    digits: digitsOnly || null,
    valid: false,
  };
}

function formatPhoneForStorage(value, options) {
  const { e164, digits } = parsePhone(value, options);
  if (e164) return e164;
  return digits || '';
}

function normalizePhoneDigits(value, options) {
  const { digits } = parsePhone(value, options);
  return digits;
}

function normalizePhoneForDb(value, options) {
  const { e164, digits, valid } = parsePhone(value, options);
  return {
    phone: e164 || digits || '',
    phoneNorm: digits,
    valid,
  };
}

function formatPhoneForDisplay(value, options = {}) {
  const defaultCountry = (options.defaultCountry || DEFAULT_COUNTRY).toUpperCase();
  const raw = toTrim(value);
  if (!raw) return '';

  const extensionMatch = raw.match(/\b(?:ext\.?|x)\s*\d+$/i);
  const extension = extensionMatch ? extensionMatch[0].trim() : '';
  const core = extension ? raw.slice(0, raw.length - extension.length).trim() : raw;

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(core, defaultCountry);
  } catch (err) {
    parsed = null;
  }

  let formatted = core;
  if (parsed && parsed.isValid()) {
    const national = String(parsed.nationalNumber || '');
    if (parsed.countryCallingCode === '1' && national.length === 10) {
      formatted = `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
    } else {
      formatted = parsed.formatInternational();
    }
  } else {
    const digits = core.replace(/\D+/g, '');
    if ((digits.length === 11 && digits.startsWith('1')) || core.startsWith('+1')) {
      const national = digits.slice(-10);
      if (national.length === 10) {
        formatted = `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
      }
    } else if (digits.length === 10) {
      formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }

  return extension ? `${formatted} ${extension}` : formatted;
}

module.exports = {
  DEFAULT_COUNTRY,
  parsePhone,
  formatPhoneForStorage,
  normalizePhoneDigits,
  normalizePhoneForDb,
  formatPhoneForDisplay,
};
