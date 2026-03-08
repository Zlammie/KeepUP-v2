const appendUnsubscribeFooter = ({ html, text, unsubscribeUrl }) => {
  if (!unsubscribeUrl) return { html, text };

  const htmlHasFooter = typeof html === 'string' && html.includes('data-keepup-unsubscribe');
  const textHasFooter = typeof text === 'string' && text.toLowerCase().includes('unsubscribe:');

  let nextHtml = html || '';
  let nextText = text || '';

  if (nextHtml && !htmlHasFooter) {
    const footer =
      `<div data-keepup-unsubscribe style="margin-top:24px;font-size:12px;color:#666;">` +
      `To unsubscribe, <a href="${unsubscribeUrl}">click here</a>.` +
      `</div>`;
    nextHtml = `${nextHtml}${footer}`;
  }

  if (nextText && !textHasFooter) {
    nextText = `${nextText}\n\nTo unsubscribe: ${unsubscribeUrl}`;
  }

  return { html: nextHtml, text: nextText };
};

module.exports = { appendUnsubscribeFooter };
