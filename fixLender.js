const mongoose = require('mongoose');
const Contact = require('./server/models/Contact'); // adjust path if needed

const MONGO_URI = 'mongodb://localhost:27017/keepup'; // your URI

async function migrate() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const contacts = await Contact.find({});
  for (let contact of contacts) {
    let modified = false;
    contact.lenders.forEach(link => {
      if (link.status === undefined) {
        link.status = 'invite';
        modified = true;
      }
      if (link.isPrimary === undefined) {
        link.isPrimary = false;
        modified = true;
      }
    });
    if (modified) {
      await contact.save();
      console.log(`✔ Updated contact ${contact._id}`);
    }
  }

  console.log('✅ Migration complete');
  mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});