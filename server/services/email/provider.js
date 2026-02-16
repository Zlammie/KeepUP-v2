const mockProvider = require('./mockProvider');
const sendgridProvider = require('./sendgridProvider');

async function sendEmail(payload, providerName = 'mock', options = {}) {
  switch (String(providerName || 'mock').toLowerCase()) {
    case 'sendgrid':
      return sendgridProvider.sendEmail(payload, options);
    case 'mock':
    default:
      return mockProvider.sendEmail(payload, options);
  }
}

module.exports = { sendEmail };
