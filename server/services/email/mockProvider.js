async function sendEmail({ to, subject }) {
  const messageId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  console.log('[mock-email] sent', { to, subject, messageId });
  return { messageId };
}

module.exports = { sendEmail };
