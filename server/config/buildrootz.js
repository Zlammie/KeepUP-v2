const mongoose = require('mongoose');

let buildrootzConn = null;

const getUri = () => (process.env.BUILDROOTZ_MONGODB_URI || '').trim();
const getDbName = () => (process.env.BUILDROOTZ_DB_NAME || '').trim();

function getBuildrootzConnection() {
  if (buildrootzConn) return buildrootzConn;

  const uri = getUri();
  if (!uri) {
    throw new Error('BUILDROOTZ_MONGODB_URI is required for BuildRootz publishing');
  }

  const dbName = getDbName() || undefined; // respect explicit casing if provided

  buildrootzConn = mongoose.createConnection(uri, dbName ? { dbName } : undefined);

  buildrootzConn.on('error', (err) => {
    console.error('[buildrootz] connection error:', err.message || err);
  });

  buildrootzConn.once('connected', () => {
    console.info('[buildrootz] connected', { db: buildrootzConn.name });
  });

  return buildrootzConn;
}

module.exports = { getBuildrootzConnection };
