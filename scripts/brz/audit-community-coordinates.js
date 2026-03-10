/* eslint-disable no-console */
const mongoose = require('mongoose');

require('../../server/bootstrap/env');

const Community = require('../../server/models/Community');

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/keepup';

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
};

const companyArg = getArgValue('company');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const toNum = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const readGeo = (lot) => {
  if (!lot || typeof lot !== 'object') return null;
  const lat = toNum(lot.latitude ?? lot.lat ?? lot.geo?.lat ?? lot.location?.lat);
  const lng = toNum(lot.longitude ?? lot.lng ?? lot.geo?.lng ?? lot.location?.lng);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

async function run() {
  if (companyArg && !isObjectId(companyArg)) {
    throw new Error('Invalid --company value (must be ObjectId)');
  }

  await mongoose.connect(MONGO_URI);
  console.log('[audit-community-coordinates] connected');

  const filter = {
    'buildrootz.publicCommunityId': { $nin: [null, ''] }
  };
  if (companyArg) {
    filter.company = new mongoose.Types.ObjectId(companyArg);
  }

  const communities = await Community.find(filter)
    .select('_id company name city state buildrootz.publicCommunityId lots._id lots.buildrootz.isPublished lots.latitude lots.longitude lots.lat lots.lng lots.geo lots.location')
    .lean();

  if (!communities.length) {
    console.log('[audit-community-coordinates] no mapped communities found');
    await mongoose.connection.close();
    return;
  }

  let missingAllGeo = 0;
  let missingPublishedGeo = 0;

  communities.forEach((community) => {
    const lots = Array.isArray(community.lots) ? community.lots : [];
    const allGeo = lots.map(readGeo).filter(Boolean);
    const publishedLots = lots.filter((lot) => Boolean(lot?.buildrootz?.isPublished));
    const publishedGeo = publishedLots.map(readGeo).filter(Boolean);

    if (!allGeo.length) missingAllGeo += 1;
    if (!publishedGeo.length) missingPublishedGeo += 1;

    const source = publishedGeo.length ? publishedGeo : allGeo;
    let centroid = null;
    if (source.length) {
      const sum = source.reduce((acc, geo) => ({
        lat: acc.lat + geo.lat,
        lng: acc.lng + geo.lng
      }), { lat: 0, lng: 0 });
      centroid = {
        lat: Number((sum.lat / source.length).toFixed(6)),
        lng: Number((sum.lng / source.length).toFixed(6))
      };
    }

    console.log(JSON.stringify({
      companyId: String(community.company || ''),
      communityId: String(community._id || ''),
      publicCommunityId: String(community?.buildrootz?.publicCommunityId || ''),
      name: community.name || '',
      city: community.city || '',
      state: community.state || '',
      lotsTotal: lots.length,
      lotsPublished: publishedLots.length,
      lotsWithGeo: allGeo.length,
      publishedLotsWithGeo: publishedGeo.length,
      centroid
    }));
  });

  console.log('[audit-community-coordinates] summary', {
    totalCommunities: communities.length,
    missingAllGeo,
    missingPublishedGeo
  });

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('[audit-community-coordinates] fatal', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // no-op
  }
  process.exitCode = 1;
});
