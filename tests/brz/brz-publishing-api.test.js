const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const brzPublishingApiRouter = require('../../server/routes/api/brz-publishing.api');

async function makeRequest({ user } = {}) {
  const app = express();
  app.use((req, _res, next) => {
    req.user = user || null;
    next();
  });
  app.use('/api/brz/publishing', brzPublishingApiRouter);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/brz/publishing/bootstrap`);
    const body = await response.json();
    return { status: response.status, body };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('bootstrap route returns explicit missing company context error', async () => {
  const result = await makeRequest({
    user: { roles: ['COMPANY_ADMIN'] }
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: 'Missing company context' });
});
