const path = require('path');
const { URL } = require('url');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer = null;
let mongoUri = null;

const normalizeExternalTestUri = (uri, testDbName) => {
  const parsed = new URL(uri);
  const rawName = (testDbName || parsed.pathname || '').replace(/^\//, '').trim();
  let dbName = rawName || 'keepup_test';
  if (!dbName.endsWith('_test')) {
    dbName = `${dbName}_test`;
  }
  parsed.pathname = `/${dbName}`;
  return { uri: parsed.toString(), dbName };
};

const startTestDb = async () => {
  if (mongoServer || mongoose.connection?.readyState) return mongoUri;

  if (process.env.EMAIL_TEST_USE_EXTERNAL_DB === 'true' && process.env.MONGO_URI) {
    const { uri, dbName } = normalizeExternalTestUri(process.env.MONGO_URI, process.env.TEST_DB_NAME);
    mongoUri = uri;
    process.env.MONGO_URI = uri;
    if (process.env.NODE_ENV !== 'test') {
      process.env.NODE_ENV = 'test';
    }
    await mongoose.connect(uri, { dbName });
    return mongoUri;
  }

  mongoServer = await MongoMemoryServer.create({
    instance: { ip: '127.0.0.1', port: 0 }
  });
  mongoUri = mongoServer.getUri();
  process.env.MONGO_URI = mongoUri;
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'test';
  }
  await mongoose.connect(mongoUri, { dbName: 'keepup_email_test' });
  return mongoUri;
};

const resetTestDb = async () => {
  if (!mongoose.connection?.readyState) return;
  await mongoose.connection.dropDatabase();
};

const stopTestDb = async () => {
  if (mongoose.connection?.readyState) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
    mongoUri = null;
  }
};

const resetEmailModuleCache = () => {
  const roots = [
    path.join(process.cwd(), 'server', 'services', 'email')
  ];

  Object.keys(require.cache).forEach((key) => {
    if (roots.some((root) => key.startsWith(root))) {
      delete require.cache[key];
    }
  });
};

module.exports = {
  startTestDb,
  resetTestDb,
  stopTestDb,
  resetEmailModuleCache
};
