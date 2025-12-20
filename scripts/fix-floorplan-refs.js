// scripts/fix-floorplan-refs.js
// Rewire lot.floorPlan values that point to missing FloorPlan documents.
// Edit the replacements map below to set oldId -> newId (or null to clear).
require('dotenv').config();
const mongoose = require('mongoose');
const Community = require('../server/models/Community');

// TODO: Adjust mappings as needed before running
const replacements = {
  // oldId : newId
  '6858ad958ddd69c0723f57ce': '68e5d64244db85c31776f6ba',
  '6858ad818ddd69c0723f57cc': '68e5d64244db85c31776f6ba',
  '6858adc18ddd69c0723f57d2': '68e5d64244db85c31776f6ba',
  '6858ada68ddd69c0723f57d0': '68e5d64244db85c31776f6ba'
};

(async () => {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/crm-form';
  await mongoose.connect(uri);
  let total = 0;

  // First clear empty-string floorPlan values using the raw collection to avoid ObjectId casting
  const emptyRes = await Community.collection.updateMany(
    { 'lots.floorPlan': '' },
    [
      {
        $set: {
          lots: {
            $map: {
              input: '$lots',
              as: 'lot',
              in: {
                $mergeObjects: [
                  '$$lot',
                  {
                    floorPlan: {
                      $cond: [{ $eq: ['$$lot.floorPlan', ''] }, null, '$$lot.floorPlan']
                    }
                  }
                ]
              }
            }
          }
        }
      }
    ]
  );
  if (emptyRes.modifiedCount) {
    total += emptyRes.modifiedCount;
    console.log(`Cleared empty floorPlan on ${emptyRes.modifiedCount} lot(s)`);
  }

  // Then rewire known bad ids
  for (const [oldId, newId] of Object.entries(replacements)) {
    const res = await Community.updateMany(
      { 'lots.floorPlan': oldId },
      { $set: { 'lots.$[lot].floorPlan': newId } },
      { arrayFilters: [{ 'lot.floorPlan': oldId }] }
    );
    total += res.modifiedCount || 0;
    console.log(`Rewired ${res.modifiedCount || 0} lot(s) from "${oldId || '(empty)'}" -> ${newId || 'null'}`);
  }

  await mongoose.disconnect();
  console.log(`Total lots updated: ${total}`);
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
