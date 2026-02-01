const mockProvider = require('./mockProvider');

async function sendEmail(payload, providerName = 'mock') {
  switch (String(providerName || 'mock').toLowerCase()) {
    case 'mock':
    default:
      return mockProvider.sendEmail(payload);
  }
}

module.exports = { sendEmail };
