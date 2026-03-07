/* eslint-disable no-console */
const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const Community = require('../../server/models/Community');
const {
  normalizeListingLocation,
  buildListingLocationPersistencePatch
} = require('../../server/services/locationService');

const trimString = (value) => (value == null ? '' : String(value).trim());

const hasValue = (value) => Boolean(trimString(value));

const resolveMongoUri = () =>
  trimString(process.env.MONGO_URI)
  || trimString(process.env.MONGODB_URI)
  || 'mongodb://localhost:27017/keepup';

const hasAnyAddressSource = (lot) => (
  hasValue(lot?.address)
  || hasValue(lot?.address1)
  || hasValue(lot?.street)
  || hasValue(lot?.streetAddress)
  || hasValue(lot?.postalCode)
  || hasValue(lot?.zip)
  || hasValue(lot?.postal)
  || hasValue(lot?.formattedAddress)
  || hasValue(lot?.fullAddress)
  || hasValue(lot?.addressFormatted)
  || (lot?.addressObject && typeof lot.addressObject === 'object')
  || (lot?.addressComponents && typeof lot.addressComponents === 'object')
  || (lot?.location && typeof lot.location === 'object')
  || (lot?.geo && typeof lot.geo === 'object')
  || (lot?.geocode && typeof lot.geocode === 'object')
  || (lot?.geocoding && typeof lot.geocoding === 'object')
);

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const parseCliArgs = (argv = process.argv.slice(2)) => {
  const args = Array.isArray(argv) ? argv : [];
  const dryRun = args.includes('--dry-run');
  const companyArg = args.find((arg) => arg.startsWith('--company-id='));
  const companyId = companyArg ? trimString(companyArg.split('=').slice(1).join('=')) : '';
  if (companyId && !isObjectId(companyId)) {
    throw new Error(`Invalid --company-id value: ${companyId}`);
  }
  return { dryRun, companyId: companyId || null };
};

async function backfillListingLocation({
  dryRun = false,
  companyId = null,
  logger = console
} = {}) {
  const report = {
    dryRun: Boolean(dryRun),
    scannedCommunities: 0,
    scannedListings: 0,
    candidates: 0,
    updatedListings: 0,
    skippedAlreadyNormalized: 0,
    skippedNoAddressSource: 0,
    skippedNotDerivable: 0,
    errors: 0,
    touchedCommunityIds: []
  };
  const touchedCommunityIds = new Set();
  const shouldConnect = mongoose.connection.readyState === 0;

  if (shouldConnect) {
    await mongoose.connect(resolveMongoUri());
  }

  try {
    const query = { 'lots.0': { $exists: true } };
    if (companyId) {
      query.company = new mongoose.Types.ObjectId(companyId);
    }

    const cursor = Community.find(query)
      .select(
        '_id company city state '
        + 'lots._id lots.address lots.address1 lots.street lots.streetAddress '
        + 'lots.formattedAddress lots.fullAddress lots.addressFormatted '
        + 'lots.city lots.state lots.postalCode lots.zip lots.postal '
        + 'lots.addressObject lots.addressComponents lots.addressData '
        + 'lots.location lots.geo lots.geocode lots.geocoding'
      )
      .lean()
      .cursor();

    for await (const community of cursor) {
      report.scannedCommunities += 1;
      const lots = Array.isArray(community?.lots) ? community.lots : [];
      if (!lots.length) continue;

      const operations = [];
      for (const lot of lots) {
        report.scannedListings += 1;
        try {
          const hasSplitFields = hasValue(lot?.city) && hasValue(lot?.state) && hasValue(lot?.postalCode);
          if (hasSplitFields) {
            report.skippedAlreadyNormalized += 1;
            continue;
          }

          if (!hasAnyAddressSource(lot)) {
            report.skippedNoAddressSource += 1;
            continue;
          }

          report.candidates += 1;
          const normalizedLocation = normalizeListingLocation(lot, { community });
          const patch = buildListingLocationPersistencePatch({
            listing: lot,
            normalizedLocation
          });
          if (!patch) {
            report.skippedNotDerivable += 1;
            continue;
          }

          const set = {};
          Object.entries(patch).forEach(([key, value]) => {
            set[`lots.$.${key}`] = value;
          });
          if (!Object.keys(set).length) {
            report.skippedNotDerivable += 1;
            continue;
          }

          operations.push({
            updateOne: {
              filter: {
                _id: community._id,
                company: community.company,
                'lots._id': lot._id
              },
              update: { $set: set }
            }
          });
        } catch (err) {
          report.errors += 1;
          logger.error(
            `Location backfill lot error (community=${trimString(community?._id)}, lot=${trimString(lot?._id)}): ${trimString(err?.message) || 'unknown'}`
          );
        }
      }

      if (!operations.length) continue;
      touchedCommunityIds.add(String(community._id));
      if (dryRun) {
        report.updatedListings += operations.length;
        continue;
      }

      try {
        const result = await Community.bulkWrite(operations, { ordered: false });
        const modified = Number(result?.modifiedCount ?? result?.nModified ?? 0);
        report.updatedListings += modified || operations.length;
      } catch (err) {
        report.errors += 1;
        logger.error(
          `Location backfill bulk write error (community=${trimString(community?._id)}): ${trimString(err?.message) || 'unknown'}`
        );
      }
    }
  } finally {
    report.touchedCommunityIds = Array.from(touchedCommunityIds);
    if (shouldConnect) {
      await mongoose.disconnect();
    }
  }

  logger.log('Listing location backfill complete:', {
    dryRun: report.dryRun,
    scannedCommunities: report.scannedCommunities,
    scannedListings: report.scannedListings,
    candidates: report.candidates,
    updatedListings: report.updatedListings,
    skippedAlreadyNormalized: report.skippedAlreadyNormalized,
    skippedNoAddressSource: report.skippedNoAddressSource,
    skippedNotDerivable: report.skippedNotDerivable,
    errors: report.errors,
    touchedCommunityCount: report.touchedCommunityIds.length
  });

  return report;
}

if (require.main === module) {
  (async () => {
    try {
      const args = parseCliArgs(process.argv.slice(2));
      await backfillListingLocation(args);
      process.exit(0);
    } catch (err) {
      console.error(trimString(err?.message) || err);
      process.exit(1);
    }
  })();
}

module.exports = {
  backfillListingLocation,
  parseCliArgs
};
