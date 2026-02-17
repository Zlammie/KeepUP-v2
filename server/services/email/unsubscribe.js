const Contact = require('../../models/Contact');
const EmailSettings = require('../../models/EmailSettings');
const Suppression = require('../../models/Suppression');
const { normalizeEmail } = require('../../utils/normalizeEmail');

async function applyUnsubscribeBehavior({ companyId, email }) {
  if (!companyId || !email) return { updated: 0 };

  const settings = await EmailSettings.findOne({ companyId }).lean();
  const behavior = settings?.unsubscribeBehavior || 'do_not_email';

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) {
    await Suppression.findOneAndUpdate(
      { companyId, email: normalizedEmail },
      { $set: { reason: Suppression.REASONS.UNSUBSCRIBED } },
      { upsert: true, new: false }
    );
  }

  const update = {};
  const set = {};
  const addToSet = {};

  if (behavior === 'set_not_interested') {
    set.status = 'Not-Interested';
    set.doNotEmail = true;
  } else if (behavior === 'tag_unsubscribed') {
    set.doNotEmail = true;
    addToSet.tags = 'Unsubscribed';
  } else {
    set.doNotEmail = true;
  }

  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(addToSet).length) update.$addToSet = addToSet;

  if (!Object.keys(update).length) return { updated: 0 };

  const result = await Contact.updateMany(
    { company: companyId, email: String(email).toLowerCase().trim() },
    update
  );
  return { updated: result?.modifiedCount || 0 };
}

module.exports = { applyUnsubscribeBehavior };
