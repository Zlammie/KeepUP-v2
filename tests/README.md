# Email Tests

## Run
- `npm run test:email`

## Notes
- Tests use an in-memory MongoDB instance via `mongodb-memory-server` by default.
- No production data is touched.
- Optional external DB (debug only):
  - Set `EMAIL_TEST_USE_EXTERNAL_DB=true`
  - Set `MONGO_URI=...`
  - Optional: `TEST_DB_NAME=keepup` (a `_test` suffix is enforced)
