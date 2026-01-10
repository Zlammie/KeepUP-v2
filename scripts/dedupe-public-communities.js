// scripts/dedupe-public-communities.js
// Groups PublicCommunity docs by (companyId, communityId), keeps the newest, rewires PublicHomes, and removes duplicates.
require('dotenv').config();
const mongoose = require('mongoose');

const PublicCommunity = require('../server/models/buildrootz/PublicCommunity');
const PublicHome = require('../server/models/buildrootz/PublicHome');

(async () => {
  try {
    const uri = process.env.BUILDROOTZ_MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
      console.error('BUILDROOTZ_MONGODB_URI (or MONGO_URI) is required');
      process.exit(1);
    }
    await mongoose.connect(uri);

    const pipeline = [
      {
        $group: {
          _id: { companyId: '$companyId', communityId: '$communityId' },
          ids: { $push: { id: '$_id', createdAt: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ];

    const groups = await PublicCommunity.aggregate(pipeline);
    console.log('Duplicate groups:', groups.length);
    for (const group of groups) {
      const { companyId, communityId } = group._id;
      const sorted = group.ids.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const keep = sorted[0].id;
      const dropIds = sorted.slice(1).map((x) => x.id);

      if (!dropIds.length) continue;

      await PublicHome.updateMany(
        { publicCommunityId: { $in: dropIds } },
        { $set: { publicCommunityId: keep, communityId } }
      );
      await PublicCommunity.deleteMany({ _id: { $in: dropIds } });

      console.log(
        'Deduped',
        { companyId: String(companyId), communityId: String(communityId) },
        'kept', String(keep),
        'deleted', dropIds.map(String)
      );
    }

    await mongoose.disconnect();
    console.log('Done.');
  } catch (err) {
    console.error('Error during dedupe:', err);
    process.exit(1);
  }
})();
