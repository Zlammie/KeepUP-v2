## Docker Quick-Start (1 command)

1. Install **Docker Desktop** (if you haven’t already).  
2. In your terminal, from the project root, run:

   ```bash
   docker-compose up --build
   ```

## Beta sign-up SMTP configuration

The `/beta-signup` page emails submissions via SMTP. Set the following variables (see `.env.example` for defaults):

- `BETA_SIGNUP_TO`: Destination inbox (Zoho or similar) that should receive the request.
- `BETA_SIGNUP_FROM`: From address that is authorized to send through your SMTP provider (defaults to `BETA_SMTP_USER` if omitted).
- `BETA_SMTP_HOST` / `BETA_SMTP_PORT`: SMTP server + port (Zoho uses `smtp.zoho.com:465`).
- `BETA_SMTP_USER` / `BETA_SMTP_PASS`: Credentials for the SMTP account.
- `BETA_SMTP_SECURE`: `true` for TLS (465) or `false` for STARTTLS ports like 587.
- Optional `BETA_SIGNUP_SUBJECT` if you want to override the default subject line.

If you already manage Zoho credentials elsewhere, you can also define the equivalent `ZOHO_SMTP_*` env vars; the beta mailer will fall back to them automatically.

## Password reset & invites

Forgot-password and invite emails reuse the same SMTP credentials (preferring `SMTP_*`, then `BETA_SMTP_*`/`ZOHO_SMTP_*`). Make sure `BASE_URL` matches your public app domain so the reset links open correctly. Set `SMTP_FROM` to the from-address you want (defaults to `noreply@keepupcrm.com` if unset).

## Email automations (MVP)

- Status-change triggers are wired in `server/routes/contactRoutes.js` inside the `PUT /api/contacts/:id` handler (after the contact update succeeds).
- The dev email job processor runs in `server/server.js` on an interval (set `EMAIL_JOB_PROCESSOR=true` to force enable, or `EMAIL_JOB_POLL_MS` to adjust).

## BuildRootz publishing

- Set `BUILDROOTZ_MONGODB_URI` to the BuildRootz Mongo connection string (runs on a separate cluster/DB from `MONGO_URI`).
- If your BuildRootz database already exists with a specific casing, set `BUILDROOTZ_DB_NAME` to match (e.g., `BuildRootz`) to avoid Mongo’s “DatabaseDifferCase” error.
- If your listing media are served from a host, set `BUILDROOTZ_UPLOAD_BASE_URL` (or ensure `BASE_URL` is correct) so `/uploads/...` paths become absolute URLs in BuildRootz.
- Publishing is tenant-scoped; users can only publish homes in their company.
- Endpoints (all `POST`, auth required):
  - `/api/buildrootz/homes/:id/publish`
  - `/api/buildrootz/homes/:id/unpublish`
  - `/api/buildrootz/homes/:id/sync`

Optional: to enable auto geocoding of lat/lng via Google Maps, set `GOOGLE_MAPS_API_KEY`.

Quick curl test (replace `SID_COOKIE` with your session cookie and `HOME_ID` with the KeepUP lot id):
```bash
curl -X POST http://localhost:3000/api/buildrootz/homes/HOME_ID/publish \
  -H "Cookie: keepup.sid=SID_COOKIE"
```
