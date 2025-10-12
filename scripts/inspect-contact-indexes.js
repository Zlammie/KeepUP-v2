const mongoose = require('mongoose');
const URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/crm-form'; // prefer Atlas connection string

(async () => {
  await mongoose.connect(URI);
  const coll = mongoose.connection.db.collection('contacts');
  const idx = await coll.indexes();
  console.log('Indexes:', idx.map(i => ({ name: i.name, key: i.key, unique: !!i.unique })));

  // How many docs have non-empty email/phone but NULL normalized fields?
  const badEmail = await coll.countDocuments({ email: { $type: 'string', $ne: '' }, $or: [{ emailNorm: null }, { emailNorm: { $exists: false } }] });
  const badPhone = await coll.countDocuments({ phone: { $type: 'string', $ne: '' }, $or: [{ phoneNorm: null }, { phoneNorm: { $exists: false } }] });
  console.log({ docsMissingEmailNorm: badEmail, docsMissingPhoneNorm: badPhone });

  await mongoose.disconnect();
})();
