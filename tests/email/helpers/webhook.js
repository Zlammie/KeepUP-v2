const buildSendgridEvent = ({
  event = 'spamreport',
  email = 'spam@example.com',
  companyId,
  jobId,
  sgEventId,
  sgMessageId,
  timestamp
} = {}) => {
  const stamp = timestamp || Math.floor(Date.now() / 1000);
  return {
    event,
    email,
    sg_event_id: sgEventId || `evt_${Date.now().toString(36)}`,
    sg_message_id: sgMessageId || `msg_${Date.now().toString(36)}`,
    timestamp: stamp,
    custom_args: {
      ...(companyId ? { companyId: String(companyId) } : {}),
      ...(jobId ? { jobId: String(jobId) } : {})
    }
  };
};

module.exports = { buildSendgridEvent };
