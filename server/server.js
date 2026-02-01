const mongoose = require('mongoose');
const { loadedFrom: envFile } = require('./bootstrap/env');
const app = require('./app');
const connectDB = require('./config/db');
const ensureKeepupAdmin = require('./bootstrap/ensureKeepupAdmin');

const PORT = Number(process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGO_URI;

console.log('[env]', {
  NODE_ENV: process.env.NODE_ENV,
  ENV_FILE: envFile || 'not found',
  MONGO_HEAD: MONGO_URI ? `${String(MONGO_URI).slice(0, 32)}...` : 'missing'
});

function setupShutdown(server) {
  let isShuttingDown = false;

  const close = (reason, code = 0) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`[shutdown] ${reason}. Closing HTTP server...`);
    server.close(() => {
      mongoose.connection
        .close(false)
        .then(() => {
          console.log('[shutdown] MongoDB connection closed.');
          process.exit(code);
        })
        .catch((err) => {
          console.error('[shutdown] Error closing MongoDB:', err);
          process.exit(code || 1);
        });
    });

    // Failsafe in case close hangs
    setTimeout(() => {
      console.warn('[shutdown] Force exiting after timeout.');
      process.exit(code || 1);
    }, 5000).unref();
  };

  process.once('SIGINT', () => close('SIGINT'));
  process.once('SIGTERM', () => close('SIGTERM'));
  process.once('unhandledRejection', (err) => {
    console.error('[fatal] Unhandled rejection:', err);
    close('unhandledRejection', 1);
  });
  process.once('uncaughtException', (err) => {
    console.error('[fatal] Uncaught exception:', err);
    close('uncaughtException', 1);
  });
}

async function start() {
  if (!MONGO_URI) {
    console.error('[startup] MONGO_URI is required but was not provided.');
    process.exit(1);
  }

  try {
    await connectDB(MONGO_URI);
    await ensureKeepupAdmin();
    const server = app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
    setupShutdown(server);
    return server;
  } catch (err) {
    console.error('[startup] Failed to start:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { start };
