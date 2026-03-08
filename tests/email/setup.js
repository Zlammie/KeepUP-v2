const { before, after, beforeEach } = require('node:test');
const { startTestDb, stopTestDb, resetTestDb } = require('./helpers/testHarness');

before(async () => {
  await startTestDb();
});

after(async () => {
  await stopTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});
