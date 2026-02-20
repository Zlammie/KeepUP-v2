const Company = require('../models/Company');
const BuilderProfile = require('../models/buildrootz/BuilderProfile');

const slugify = (value = '') =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

async function publishBuilderProfile({ companyId, name, logoUrl, websiteUrl, description, slug: slugInput }) {
  if (!companyId) throw new Error('companyId is required');

  const company = await Company.findById(companyId).select('_id name slug buildrootzProfile').lean();
  if (!company) {
    const err = new Error('Company not found');
    err.status = 404;
    throw err;
  }

  const nameToUse = name || company.name || '';
  const slug = slugify(slugInput || company.slug || nameToUse);
  const descriptionToUse = description ?? company.buildrootzProfile?.description ?? '';
  const logoToUse = logoUrl ?? company.buildrootzProfile?.logoUrl ?? '';
  const websiteToUse = websiteUrl ?? company.buildrootzProfile?.websiteUrl ?? '';
  const publishedAt = new Date();

  const doc = await BuilderProfile.findOneAndUpdate(
    { companyId },
    {
      $set: {
        name: nameToUse,
        slug,
        logoUrl: logoToUse || '',
        websiteUrl: websiteToUse || '',
        description: descriptionToUse || '',
        publishedAt
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return doc;
}

module.exports = {
  publishBuilderProfile
};
