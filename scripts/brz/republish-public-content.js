/* eslint-disable no-console */
const mongoose = require('mongoose');

require('../../server/bootstrap/env');

const Company = require('../../server/models/Company');
const Community = require('../../server/models/Community');
const {
  publishCompanyPackage,
  publishCompanyInventory
} = require('../../server/services/brzPublishingService');

const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/keepup';

const DRY_RUN = process.argv.includes('--dry-run');

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
};

const companyArg = getArgValue('company');

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

async function run() {
  if (companyArg && !isObjectId(companyArg)) {
    throw new Error('Invalid --company value (must be ObjectId)');
  }

  await mongoose.connect(MONGO_URI);
  console.log(`[republish-public-content] connected (${DRY_RUN ? 'DRY_RUN' : 'WRITE'})`);

  const communityFilter = {
    'buildrootz.publicCommunityId': { $nin: [null, ''] }
  };
  if (companyArg) {
    communityFilter.company = new mongoose.Types.ObjectId(companyArg);
  }

  const communities = await Community.find(communityFilter)
    .select('_id company name lots.buildrootz.isPublished')
    .lean();

  const companyIds = Array.from(
    new Set(
      communities
        .map((community) => String(community.company || ''))
        .filter(Boolean)
    )
  );

  if (!companyIds.length) {
    console.log('[republish-public-content] no mapped communities found');
    await mongoose.connection.close();
    return;
  }

  const companies = await Company.find({
    _id: { $in: companyIds.map((id) => new mongoose.Types.ObjectId(id)) }
  })
    .select('_id name')
    .lean();

  const companyNameById = new Map(
    companies.map((company) => [String(company._id), company.name || String(company._id)])
  );

  const communitiesByCompany = new Map();
  communities.forEach((community) => {
    const companyId = String(community.company || '');
    if (!companyId) return;
    const list = communitiesByCompany.get(companyId) || [];
    list.push(community);
    communitiesByCompany.set(companyId, list);
  });

  const stats = {
    companiesTargeted: companyIds.length,
    companiesProcessed: 0,
    companiesFailed: 0
  };

  for (const companyId of companyIds) {
    const companyCommunities = communitiesByCompany.get(companyId) || [];
    const publishedLotCount = companyCommunities.reduce((sum, community) => {
      const lots = Array.isArray(community.lots) ? community.lots : [];
      return sum + lots.filter((lot) => Boolean(lot?.buildrootz?.isPublished)).length;
    }, 0);

    console.log('[republish-public-content] target', {
      companyId,
      companyName: companyNameById.get(companyId) || companyId,
      mappedCommunities: companyCommunities.length,
      publishedLots: publishedLotCount
    });

    if (DRY_RUN) continue;

    try {
      const packageResult = await publishCompanyPackage({ companyId });
      const inventoryResult = await publishCompanyInventory({
        companyId,
        unpublishMissingHomes: true,
        ctx: {
          source: 'script',
          route: 'scripts/brz/republish-public-content.js'
        }
      });

      stats.companiesProcessed += 1;
      console.log('[republish-public-content] republished', {
        companyId,
        packageStatus: packageResult?.status || 'ok',
        packageMessage: packageResult?.message || '',
        inventoryStatus: inventoryResult?.status || 'ok',
        inventoryMessage: inventoryResult?.message || ''
      });
    } catch (err) {
      stats.companiesFailed += 1;
      console.error('[republish-public-content] failed', {
        companyId,
        error: err?.message || err
      });
    }
  }

  console.log('[republish-public-content] complete', stats);
  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('[republish-public-content] fatal', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // no-op
  }
  process.exitCode = 1;
});
