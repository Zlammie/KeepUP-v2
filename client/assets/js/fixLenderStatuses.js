// scripts/fixLenderStatuses.js

const mongoose = require('mongoose');
const Contact = require('../../models/Contact'); // adjust path if needed

async function run() {
  await mongoose.connect('mongodb://localhost:27017/your-db-name'); // change to match your db

  const contacts = await Contact.find({ 'lenders.status': { $exists: true } });

  for (const contact of contacts) {
    let modified = false;

    contact.lenders.forEach(entry => {
      if (entry.status && entry.status !== entry.status.toLowerCase()) {
        entry.status = entry.status.toLowerCase();
        modified = true;
      }
    });

    if (modified) {
      await contact.save();
      console.log(`✅ Updated contact ${contact._id}`);
    }
  }

  console.log('🎉 All done.');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Error in script:', err);
});
