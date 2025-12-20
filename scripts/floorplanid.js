// scripts/floorplanid.js
// Lists lots whose floorPlan references no longer point to an existing FloorPlan document.
require('dotenv').config();
const mongoose = require('mongoose');
const Community = require('../server/models/Community');
const FloorPlan = require('../server/models/FloorPlan');

(async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crm-form';
  await mongoose.connect(uri);

  // Build a set of valid floor plan ids
  const plans = await FloorPlan.find({}, '_id planNumber name').lean();
  const validIds = new Set(plans.map((p) => String(p._id)));

  // Find lots whose floorPlan is set but not in FloorPlan collection
  const broken = await Community.aggregate([
    { $unwind: '$lots' },
    { $match: { 'lots.floorPlan': { $ne: null } } },
    {
      $project: {
        community: '$name',
        lotId: '$lots._id',
        address: '$lots.address',
        lot: '$lots.lot',
        block: '$lots.block',
        floorPlan: '$lots.floorPlan'
      }
    },
    {
      $match: {
        $expr: { $not: { $in: [{ $toString: '$floorPlan' }, Array.from(validIds)] } }
      }
    }
  ]).exec();

  console.log('Broken lot floorPlan references:');
  console.table(
    broken.map((b) => ({
      community: b.community,
      lotId: b.lotId,
      address: b.address,
      lot: b.lot,
      block: b.block,
      floorPlan: b.floorPlan
    }))
  );

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
