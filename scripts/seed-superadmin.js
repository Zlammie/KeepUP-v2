// scripts/seed-superadmin.js  (fixed for new User model)
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Company = require('../server/models/Company');
const User = require('../server/models/User');

(async () => {
  try {
    const [companyName, email, password] = process.argv.slice(2);
    if (!companyName || !email || !password) {
      console.error('Usage: node scripts/seed-superadmin.js "Company" "email" "password"');
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);

    let company = await Company.findOne({ name: companyName });
    if (!company) company = await Company.create({ name: companyName });

    const passwordHash = await bcrypt.hash(password, 11);

    // NEW SHAPE: roles[], company
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        passwordHash,
        roles: ['SUPER_ADMIN'],
        company: company._id,
        isActive: true,
      });
      console.log('Created SUPER_ADMIN:', user.email);
    } else {
      user.passwordHash = passwordHash;
      user.roles = ['SUPER_ADMIN'];
      user.company = company._id;
      user.isActive = true;
      await user.save();
      console.log('Updated user to SUPER_ADMIN:', user.email);
    }

    await mongoose.disconnect();
    console.log('✅ Done. You can now log in as SUPER_ADMIN.');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
})();
