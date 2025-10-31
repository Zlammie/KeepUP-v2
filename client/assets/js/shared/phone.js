// Shared phone formatting helper
export function formatPhoneDisplay(value) {
  if (value == null) return '';

  const raw = String(value).trim();
  if (!raw) return '';

  // Extract extensions (basic detection for x123 / ext123 patterns at the end)
  const extensionMatch = raw.match(/\b(?:ext\.?|x)\s*\d+$/i);
  const extension = extensionMatch ? extensionMatch[0].trim() : '';
  const core = extension ? raw.slice(0, raw.length - extension.length).trim() : raw;

  const digits = core.replace(/\D+/g, '');
  if (!digits) return raw;

  const appendExtension = (formatted) =>
    extension ? `${formatted} ${extension}` : formatted;

  // Prefer E.164 / +1 formatting when we have enough digits
  if (core.startsWith('+1') || (digits.length === 11 && digits.startsWith('1'))) {
    const national = digits.slice(-10);
    if (national.length === 10) {
      return appendExtension(
        `+1 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`
      );
    }
  }

  // Fallback for 10-digit domestic numbers without +1
  if (!core.startsWith('+') && digits.length === 10) {
    return appendExtension(
      `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    );
  }

  return appendExtension(core);
}

// Expose global for legacy scripts that are not modules
if (typeof window !== 'undefined') {
  window.formatPhoneDisplay = formatPhoneDisplay;
}
