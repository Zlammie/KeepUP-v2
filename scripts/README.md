# Scripts

This folder is for operational one-offs (backfills, migrations, QA load runs).

Email test suite is now run via:
- `npm run test:email`

Use the automated test suite whenever possible. Avoid adding ad-hoc test scripts here.

Operational scripts should:
- Import production modules/services instead of re-implementing logic.
- Include the header: "Operational script. Do not duplicate email logic here."
