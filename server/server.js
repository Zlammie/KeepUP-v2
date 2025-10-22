const { loadedFrom: envFile } = require('./bootstrap/env');
console.log('[env]', {
  NODE_ENV: process.env.NODE_ENV,
  ENV_FILE: envFile || 'not found',
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
