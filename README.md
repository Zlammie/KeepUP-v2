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
