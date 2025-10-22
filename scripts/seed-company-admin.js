// node scripts/seed-company-admin.js "ACME Homes" "admin@acme.com" "StrongTempPass123!"
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Company = require('../server/models/Company');
const User = require('../server/models/User');

(async () => {
  try {
    const mongoUri =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      process.env.MONGO_URL;
    if (!mongoUri) throw new Error('Set MONGO_URI (or MONGODB_URI) before running this script');

    await mongoose.connect(mongoUri);
    const [companyName, email, password] = process.argv.slice(2);
    if (!companyName || !email || !password) throw new Error('Usage: node scripts/seed-company-admin.js "Company" "email" "password"');

    let company = await Company.findOne({ name: companyName });
    if (!company) company = await Company.create({ name: companyName });

    const passwordHash = await bcrypt.hash(password, 11);

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email, passwordHash,
        role: 'company_admin',
        companyId: company._id,
        isActive: true
      });
    } else {
      user.passwordHash = passwordHash;
      user.role = 'company_admin';
      user.companyId = company._id;
      user.isActive = true;
      await user.save();
    }

    console.log('Seeded:', { company: company.name, adminEmail: user.email });
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
