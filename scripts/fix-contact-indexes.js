const mongoose = require('mongoose');

const URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/crm-form'; // prefer Atlas if available

async function run() {
  await mongoose.connect(URI);
  const coll = mongoose.connection.db.collection('contacts');

  const before = await coll.indexes();
  console.log('Before:', before.map(i => ({ name: i.name, key: i.key, unique: !!i.unique })));

  // Normalize any lingering empty-string norms to null (so partial index can ignore them)
  await coll.updateMany({ emailNorm: '' }, { $set: { emailNorm: null } });
  await coll.updateMany({ phoneNorm: '' }, { $set: { phoneNorm: null } });

  // Drop only the wrong indexes (skip if absent)
  for (const name of [
    '{ company: 1, email: 1 }_text',
    'email_1'
  ]) {
    try { await coll.dropIndex(name); console.log('Dropped', name); }
    catch (e) { if (!/index not found/i.test(String(e))) console.warn('Skip', name, e.message); }
  }

  // Create UNIQUE compound indexes on normalized fields.
  // NOTE: only filter by $type to avoid unsupported $ne on your server.
  await coll.createIndex(
    { company: 1, emailNorm: 1 },
    { unique: true, partialFilterExpression: { emailNorm: { $type: 'string' } }, name: 'company_1_emailNorm_1' }
  );
  await coll.createIndex(
    { company: 1, phoneNorm: 1 },
    { unique: true, partialFilterExpression: { phoneNorm: { $type: 'string' } }, name: 'company_1_phoneNorm_1' }
  );

  const after = await coll.indexes();
  console.log('After:', after.map(i => ({ name: i.name, key: i.key, unique: !!i.unique })));

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
