# Birthday App (Vercel + Supabase)

Dashboard + scheduled birthday email sender for SFGS.

## What it does

- Reads today's birthdays from the portal API (`portal.sfgs.com.ng/?page=birthdays_api`)
- Sends birthday wishes to parent emails via Brevo
- Logs sends (success/fail) and shows them in a dashboard

## Setup checklist

1. Supabase: run `birthday-app/supabase/schema.sql` in the SQL editor.
2. Deploy the dashboard to Vercel and set env vars:
   - `BIRTHDAY_SSO_SECRET` (same value as the portal)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PORTAL_BIRTHDAYS_API_URL` (e.g. `https://portal.sfgs.com.ng/?page=birthdays_api`)
   - `PORTAL_BIRTHDAYS_API_TOKEN` (must match portal `BIRTHDAY_API_TOKEN`)
3. Supabase secrets (Edge Function `birthday-sender`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `PORTAL_BIRTHDAYS_API_URL`
   - `PORTAL_BIRTHDAYS_API_TOKEN`
   - `BREVO_API_KEY`
   - `BREVO_SENDER_EMAIL`
   - `BREVO_SENDER_NAME`
4. Portal env:
   - `BIRTHDAY_APP_URL` (e.g. `https://birthdays.sfgs.com.ng`)
   - `BIRTHDAY_SSO_SECRET` (same as Vercel)
   - `BIRTHDAY_API_TOKEN` (used by birthdays API; must match `PORTAL_BIRTHDAYS_API_TOKEN`)
5. Deploy edge function `birthday-sender` and schedule it.
