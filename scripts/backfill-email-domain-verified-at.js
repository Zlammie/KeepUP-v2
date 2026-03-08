/* eslint-disable no-console */
// Operational script. Do not duplicate email logic here.
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env.development.local') });
dotenv.config();

const mongoose = require('mongoose');
const Company = require('../server/models/Company');
const CompanyEmailDomain = require('../server/models/CompanyEmailDomain');
const { buildWarmupStartState, computeWarmupState } = require('../server/services/email/emailWarmup');

const run = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set. Set it in .env or .env.development.local.');
  }

  await mongoose.connect(uri);

  const verifiedDomains = await CompanyEmailDomain.find({
    status: CompanyEmailDomain.STATUS.VERIFIED,
    verifiedAt: { $ne: null }
  })
    .select('companyId verifiedAt')
    .lean();

  let updatedCount = 0;
  for (const domain of verifiedDomains) {
    const company = await Company.findById(domain.companyId)
      .select('emailDomainVerifiedAt emailWarmup settings.timezone')
      .lean();
    if (!company) continue;

    const updates = {};
    const verifiedAt = company.emailDomainVerifiedAt || domain.verifiedAt;
    if (!company.emailDomainVerifiedAt && verifiedAt) {
      updates.emailDomainVerifiedAt = verifiedAt;
    }

    if (!company.emailWarmup && verifiedAt) {
      const warmupSeed = buildWarmupStartState({ startedAt: verifiedAt });
      const warmupComputed = computeWarmupState({
        company: { ...company, emailDomainVerifiedAt: verifiedAt, emailWarmup: warmupSeed },
        now: new Date()
      });
      updates.emailWarmup = {
        enabled: warmupComputed.enabled,
        startedAt: warmupComputed.startedAt,
        endedAt: warmupComputed.endedAt,
        dayIndex: warmupComputed.dayIndex,
        daysTotal: warmupComputed.daysTotal,
        capOverrideToday: warmupComputed.capOverrideToday,
        schedule: warmupComputed.schedule,
        lastComputedAt: warmupComputed.lastComputedAt
      };
    }

    if (Object.keys(updates).length) {
      await Company.updateOne({ _id: company._id }, { $set: updates });
      updatedCount += 1;
    }
  }

  console.log(`Backfill complete. Updated ${updatedCount} companies.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Backfill failed.', err);
  process.exit(1);
});
