const mongoose = require('mongoose');
require('../server/bootstrap/env');

const connectDB = require('../server/config/db');
const Community = require('../server/models/Community');

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeSlug = (value) => String(value || '').trim().toLowerCase();

const buildUniqueSlug = (base, docId, existing) => {
  const baseSlug = base || 'community';
  if (!existing.has(baseSlug)) {
    existing.add(baseSlug);
    return baseSlug;
  }
  const suffix = String(docId).slice(-6);
  let candidate = `${baseSlug}-${suffix}`;
  let index = 1;
  while (existing.has(candidate)) {
    candidate = `${baseSlug}-${suffix}-${index}`;
    index += 1;
  }
  existing.add(candidate);
  return candidate;
};

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is required.');
    process.exit(1);
  }

  await connectDB(uri);

  try {
    const existingDocs = await Community.find({ slug: { $nin: [null, ''] } })
      .select('slug')
      .lean();
    const existing = new Set(
      existingDocs.map((doc) => normalizeSlug(doc.slug)).filter(Boolean)
    );

    const targets = await Community.find({
      $or: [{ slug: { $exists: false } }, { slug: '' }, { slug: null }]
    })
      .select('_id name slug')
      .lean();

    if (!targets.length) {
      console.log('No communities missing slugs.');
      return;
    }

    const ops = targets.map((doc) => {
      const base = slugify(doc.name);
      const slug = buildUniqueSlug(base || `community-${String(doc._id).slice(-6)}`, doc._id, existing);
      return {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { slug } }
        }
      };
    });

    if (ops.length) {
      const result = await Community.bulkWrite(ops);
      console.log(`Updated ${result.modifiedCount || 0} community slugs.`);
    }
  } finally {
    await mongoose.connection.close();
  }
}

run().catch((err) => {
  console.error('Slug backfill failed:', err);
  process.exit(1);
});
