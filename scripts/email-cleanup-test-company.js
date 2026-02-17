// Operational script. Do not duplicate email logic here.
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('../server/config/db');
const Company = require('../server/models/Company');
const User = require('../server/models/User');
const Contact = require('../server/models/Contact');
const EmailSettings = require('../server/models/EmailSettings');
const Suppression = require('../server/models/Suppression');
const EmailTemplate = require('../server/models/EmailTemplate');
const AutomationRule = require('../server/models/AutomationRule');
const AutoFollowUpSchedule = require('../server/models/AutoFollowUpSchedule');
const EmailBlast = require('../server/models/EmailBlast');
const EmailJob = require('../server/models/EmailJob');

const QA_COMPANY_PREFIX = 'KeepUp QA Email Test - ';

function parseArgs(argv) {
  const args = { companyId: null, iUnderstand: false, force: false };
  argv.forEach((raw) => {
    if (!raw.startsWith('--')) return;
    const [key, value] = raw.replace(/^--/, '').split('=');
    if (key === 'companyId') args.companyId = value || null;
    if (key === 'i-understand') args.iUnderstand = true;
    if (key === 'force') args.force = true;
  });
  return args;
}

function loadEnv() {
  const cwd = process.cwd();
  const envLocal = path.join(cwd, '.env.development.local');
  const envDefault = path.join(cwd, '.env');
  if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
    return envLocal;
  }
  if (fs.existsSync(envDefault)) {
    dotenv.config({ path: envDefault });
    return envDefault;
  }
  dotenv.config();
  return null;
}

async function cleanupCompanyData(company) {
  if (!company?.name || !company.name.startsWith(QA_COMPANY_PREFIX)) {
    throw new Error('Cleanup refused: company name does not match QA prefix.');
  }
  const companyId = company._id;

  await Promise.all([
    EmailJob.deleteMany({ companyId }),
    EmailBlast.deleteMany({ companyId }),
    AutomationRule.deleteMany({ companyId }),
    EmailTemplate.deleteMany({ companyId }),
    EmailSettings.deleteMany({ companyId }),
    Suppression.deleteMany({ companyId }),
    Contact.deleteMany({ company: companyId }),
    AutoFollowUpSchedule.deleteMany({ company: companyId }),
    User.deleteMany({ company: companyId })
  ]);

  await Company.deleteOne({ _id: companyId });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.iUnderstand) {
    throw new Error('Missing required flag: --i-understand');
  }
  if (!args.companyId) {
    throw new Error('Missing required flag: --companyId');
  }

  const envPath = loadEnv();
  if (envPath) {
    console.log(`[email-cleanup-test-company] loaded env from ${envPath}`);
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
  if (!mongoUri) {
    throw new Error('MONGO_URI (or MONGODB_URI) is required.');
  }
  const lower = mongoUri.toLowerCase();
  const looksProd = lower.includes('mongodb.net') || lower.includes('prod') || lower.includes('keepupcrm.com');
  if (looksProd && !args.force) {
    throw new Error('Refusing to run: MONGO_URI looks like production. Use --force to override.');
  }

  await connectDB(mongoUri);

  const company = await Company.findById(args.companyId).lean();
  if (!company) throw new Error('Company not found for --companyId');

  if (!company.name.startsWith(QA_COMPANY_PREFIX)) {
    throw new Error('Cleanup refused: company name does not match QA prefix.');
  }

  await cleanupCompanyData(company);
  await mongoose.connection.close();
  console.log('Cleanup complete.');
}

main().catch(async (err) => {
  console.error('[email-cleanup-test-company] failed:', err.message || err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
