const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
require('dotenv').config({
  path: path.join(__dirname, '..', envFile),
  override: true, // <- important: clobbers any stale MONGO_URI=localhost
});
console.log('[env]', {
  NODE_ENV: process.env.NODE_ENV,
  ENV_FILE: envFile,
  MONGO_HEAD: String(process.env.MONGO_URI || '').slice(0, 45) + '...',
});
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await connectDB(process.env.MONGO_URI);
    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
