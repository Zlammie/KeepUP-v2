// server/bootstrap/env.js
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const env = process.env.NODE_ENV || 'development';
const cwd = process.cwd();
const appRoot = path.resolve(__dirname, '..', '..'); // repo root (adjust if needed)

const explicit = process.env.ENV_FILE && path.resolve(process.env.ENV_FILE);
const candidates = [
  explicit,                                // explicit path wins
  path.join(cwd, `.env.${env}.local`),
  path.join(cwd, `.env.${env}`),
  path.join(cwd, '.env.local'),
  path.join(cwd, '.env'),
  // fall back to app root in case cwd is wrong
  path.join(appRoot, `.env.${env}.local`),
  path.join(appRoot, `.env.${env}`),
  path.join(appRoot, '.env.local'),
  path.join(appRoot, '.env'),
].filter(Boolean);

let loadedFrom = null;
for (const file of candidates) {
  if (fs.existsSync(file)) {
    // Do not override env vars already provided by the runtime (e.g., Docker compose)
    dotenv.config({ path: file, override: false });
    loadedFrom = file;
    break;
  }
}

if (!loadedFrom) {
  console.warn(`[env] No .env file found for NODE_ENV=${env}`);
} else {
  console.log(`[env] Loaded ${path.basename(loadedFrom)}`);
}

module.exports = { loadedFrom, env };
