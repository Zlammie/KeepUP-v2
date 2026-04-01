const trim = (value) => (typeof value === 'string' ? value.trim() : '');

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildRecipientReason = ({ companyName, blastName }) => {
  const company = trim(companyName);
  const blast = trim(blastName);

  if (company && blast) {
    return `You are receiving this because ${company} sent you the "${blast}" email through KeepUp.`;
  }
  if (company) {
    return `You are receiving this because ${company} sent you an email through KeepUp.`;
  }
  if (blast) {
    return `You are receiving this because you were included in the "${blast}" email sent through KeepUp.`;
  }
  return 'You are receiving this because a KeepUp customer sent you an email through KeepUp.';
};

const appendUnsubscribeFooter = ({ html, text, unsubscribeUrl, companyName, blastName }) => {
  if (!unsubscribeUrl) return { html, text };

  const htmlHasFooter = typeof html === 'string' && html.includes('data-keepup-unsubscribe');
  const textHasFooter = typeof text === 'string' && text.toLowerCase().includes('unsubscribe:');
  const recipientReason = buildRecipientReason({ companyName, blastName });

  let nextHtml = html || '';
  let nextText = text || '';

  if (nextHtml && !htmlHasFooter) {
    const footer =
      `<div data-keepup-unsubscribe style="margin-top:24px;font-size:12px;color:#666;">` +
      `<div style="margin-bottom:8px;">${escapeHtml(recipientReason)}</div>` +
      `<div>To unsubscribe, <a href="${unsubscribeUrl}">click here</a>.</div>` +
      `</div>`;
    nextHtml = `${nextHtml}${footer}`;
  }

  if (nextText && !textHasFooter) {
    nextText = `${nextText}\n\n${recipientReason}\nTo unsubscribe: ${unsubscribeUrl}`;
  }

  return { html: nextHtml, text: nextText };
};

module.exports = { appendUnsubscribeFooter };
