const express = require('express');

const requireRole = require('../../middleware/requireRole');
const {
  COMMON_AUTOMATIONS,
  ensureCommonAutomation,
  disableCommonAutomation,
  getCommonAutomationStatus
} = require('../../services/email/commonAutomations');

const router = express.Router();

const READ_ROLES = ['READONLY', 'USER', 'MANAGER', 'COMPANY_ADMIN', 'SUPER_ADMIN'];
const ADMIN_ROLES = ['COMPANY_ADMIN', 'SUPER_ADMIN'];

function findDefinition(key) {
  if (!key) return null;
  return COMMON_AUTOMATIONS.find((item) => item.key === key) || null;
}

router.get('/', requireRole(...READ_ROLES), async (req, res) => {
  try {
    const automations = await getCommonAutomationStatus(req.user.company);
    res.json({ automations });
  } catch (err) {
    console.error('[email-common-automations] list failed', err);
    res.status(500).json({ error: 'Failed to load common automations' });
  }
});

router.post('/:key/enable', requireRole(...ADMIN_ROLES), async (req, res) => {
  const key = req.params.key;
  if (!findDefinition(key)) {
    return res.status(404).json({ error: 'Unknown automation key' });
  }
  try {
    await ensureCommonAutomation(req.user.company, req.user?._id, key);
    const automations = await getCommonAutomationStatus(req.user.company);
    const status = automations.find((item) => item.key === key) || null;
    res.json({ ok: true, status });
  } catch (err) {
    console.error('[email-common-automations] enable failed', err);
    res.status(500).json({ error: err.message || 'Failed to enable automation' });
  }
});

router.post('/:key/disable', requireRole(...ADMIN_ROLES), async (req, res) => {
  const key = req.params.key;
  if (!findDefinition(key)) {
    return res.status(404).json({ error: 'Unknown automation key' });
  }
  try {
    await disableCommonAutomation(req.user.company, key);
    const automations = await getCommonAutomationStatus(req.user.company);
    const status = automations.find((item) => item.key === key) || null;
    res.json({ ok: true, status });
  } catch (err) {
    console.error('[email-common-automations] disable failed', err);
    res.status(500).json({ error: err.message || 'Failed to disable automation' });
  }
});

module.exports = router;
