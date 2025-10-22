// server/bootstrap/env.js
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Resolve CWD so this works no matter where you launch from
const cwd = process.cwd();
const env = process.env.NODE_ENV || 'development';

// Ordered by most-specific to least-specific
const envFileCandidates = [
  `.env.${env}.local`,
  `.env.${env}`,
  '.env.local',
  '.env',
];

let loadedFrom = null;
for (const f of envFileCandidates) {
  const resolved = path.resolve(cwd, f);
  if (fs.existsSync(resolved)) {
    dotenv.config({ path: resolved, override: true });
    loadedFrom = f;
    break;
  }
}

// Optional: one-line debug you can leave in safely
if (!loadedFrom) {
  console.warn(`[env] No .env file found for NODE_ENV=${env} (looking for: ${envFileCandidates.join(', ')})`);
} else {
  console.log(`[env] Loaded ${loadedFrom}`);
}

module.exports = { loadedFrom, env };
