// migrate-purchaser.js
const mongoose   = require('mongoose');
const Community  = require('./models/Community');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/your-db-name', {
    useNewUrlParser:    true,
    useUnifiedTopology: true,
  });

  const communities = await Community.find();
  for (const comm of communities) {
    let dirty = false;
    comm.lots = comm.lots.map(lot => {
      // if it’s an empty string (or any non-24-hex) set to null
      if (typeof lot.purchaser === 'string' && !/^[0-9a-f]{24}$/.test(lot.purchaser)) {
        lot.purchaser = null;
        dirty = true;
      }
      return lot;
    });
    if (dirty) {
      await comm.save();
      console.log(`Cleaned purchaser fields in community ${comm._id}`);
    }
  }

  await mongoose.disconnect();
  console.log('Migration complete.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
