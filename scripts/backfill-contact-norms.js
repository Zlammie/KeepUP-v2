const mongoose = require('mongoose');
const { normalizePhoneForDb } = require('../server/utils/phone');

const uri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/crm-form'; // Atlas first, local fallback

function normEmail(v){ const t=(v||'').trim().toLowerCase(); return t || null; }

(async () => {
  await mongoose.connect(uri);
  const coll = mongoose.connection.db.collection('contacts');

  const cur = coll.find({}, { projection:{ _id:1, email:1, phone:1, emailNorm:1, phoneNorm:1 } });
  let total=0, updated=0;
  while (await cur.hasNext()) {
    const d = await cur.next();
    total++;
    const emailNorm = normEmail(d.email);
    const phoneData = normalizePhoneForDb(d.phone);

    const set = {};
    if (d.emailNorm !== emailNorm) set.emailNorm = emailNorm;
    if ((d.phoneNorm ?? null) !== phoneData.phoneNorm) set.phoneNorm = phoneData.phoneNorm;

    const currentPhone = (d.phone ?? '');
    if (currentPhone !== phoneData.phone) set.phone = phoneData.phone;

    if (Object.keys(set).length) {
      await coll.updateOne({ _id: d._id }, { $set: set });
      updated++;
    }
  }
  console.log('Processed', total, 'Updated', updated);
  await mongoose.disconnect();
})();
