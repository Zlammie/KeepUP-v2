/* eslint-disable no-console */
const path = require('path');
const mongoose = require('mongoose');
const { getBuildrootzConnection } = require('../server/config/buildrootz');

// Load env (best-effort)
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const PublicHome = require('../server/models/buildrootz/PublicHome');
const Company = require('../server/models/Company');

const DEFAULT_URI =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/keepup';

(async () => {
  await mongoose.connect(DEFAULT_URI);
  const buildrootzConn = getBuildrootzConnection();

  const companies = await Company.find().select('name slug').lean();
  const builderLookup = new Map();
  companies.forEach((company) => {
    const slugKey = (company.slug || '').trim().toLowerCase();
    const nameKey = (company.name || '').trim().toLowerCase();
    if (slugKey) builderLookup.set(slugKey, company._id);
    if (nameKey) builderLookup.set(nameKey, company._id);
  });

  const cursor = PublicHome.find({
    $or: [
      { builderId: { $exists: false } },
      { builderId: null },
      { published: { $exists: false } }
    ]
  }).cursor();

  let scanned = 0;
  let updated = 0;
  let missingBuilderMatch = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const set = {};

    if (!doc.builderId) {
      const candidates = [
        (doc.builder && doc.builder.slug) || '',
        (doc.builder && doc.builder.name) || ''
      ]
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);

      let match = null;
      for (const key of candidates) {
        if (builderLookup.has(key)) {
          match = builderLookup.get(key);
          break;
        }
      }

      if (match) {
        set.builderId = match;
      } else {
        missingBuilderMatch += 1;
      }
    }

    if (doc.published === undefined) {
      const flag = Boolean(doc.publishedAt || doc.meta?.publishVersion >= 0);
      set.published = flag;
    }

    if (Object.keys(set).length) {
      await PublicHome.updateOne({ _id: doc._id }, { $set: set });
      updated += 1;
    }
  }

  console.log(
    `Scanned ${scanned} BuildRootz homes, updated ${updated}, missing builder match ${missingBuilderMatch}`
  );

  await mongoose.connection.close();
  await buildrootzConn.close();
})();
