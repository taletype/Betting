# Deployment

- Deploy `apps/web` to Vercel.
- Run Supabase separately for database, auth, storage, and realtime.
- Configure cron routes in `apps/web/vercel.json` when the Vercel project root is `apps/web`.
- Vercel Hobby only accepts cron jobs that run once per day, so higher-frequency schedules should be moved to an external scheduler later.
- Set `CRON_SECRET` in Vercel and send the same secret from any external scheduler via `Authorization: Bearer <secret>` or `x-cron-secret`.

## Environment and secrets

- Use `infra/docs/runbooks/environment-configuration.md` as the source of truth for:
  - local/staging/production env minimums,
  - server-only vs safe public values,
  - launch pre-deploy env checklist,
  - secret rotation sequencing.
- Validate env wiring before each deploy with `./infra/scripts/check-env.sh`.
