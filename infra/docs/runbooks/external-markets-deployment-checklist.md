# Polymarket portal deployment checklist

Use this checklist when `/polymarket` shows a load error on Vercel. The old `/external-markets` route redirects to `/polymarket`.

## 1) Required Vercel environment variables

Set these in the **web** project runtime:

- `API_BASE_URL` (**required**) — absolute URL of deployed API, e.g. `https://<api-domain>`
- `NEXT_PUBLIC_API_BASE_URL` (optional) — only needed if browser/client-side code calls the API directly
- `ADMIN_API_TOKEN` (**required**) — must match API admin token for `/api/cron/external-sync`

Rules:

- In production/staging, do **not** rely on localhost defaults.
- `API_BASE_URL` should never be `http://127.0.0.1:4000` in deployed environments.

## 2) API curl checks (must return JSON)

```bash
export API_BASE_URL="https://<api-domain>"
curl -fsS "$API_BASE_URL/health"
curl -fsS "$API_BASE_URL/ready"
curl -fsS "$API_BASE_URL/external/markets"
```

Expected:

- `/health` returns JSON and `ok: true`.
- `/ready` returns JSON readiness without upstream connection errors.
- `/external/markets` returns a JSON array (`[]` is valid only if sync has no rows yet).

If any endpoint returns HTML/404/connection error, fix API deployment or `API_BASE_URL` wiring first.

## 3) Sync command / admin trigger

One-shot sync (worker path):

```bash
pnpm sync:external
```

Cron-equivalent manual trigger from web:

```bash
curl -X GET "https://<web-domain>/api/cron/external-sync" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Direct admin trigger against API:

```bash
curl -X POST "$API_BASE_URL/admin/external-sync/run" \
  -H "x-admin-token: $ADMIN_API_TOKEN"
```

## 4) DB verification (same DB used by deployed API)

```bash
psql "$SUPABASE_DB_URL" -c "select count(*) from public.external_markets;"
psql "$SUPABASE_DB_URL" -c "select count(*) from public.external_outcomes;"
psql "$SUPABASE_DB_URL" -c "select count(*) from public.external_trade_ticks;"
psql "$SUPABASE_DB_URL" -c "select count(*) from public.external_sync_checkpoints;"
```

Also verify freshness:

```bash
psql "$SUPABASE_DB_URL" -c "select source, max(last_synced_at) as last_synced_at from public.external_markets group by source;"
psql "$SUPABASE_DB_URL" -c "select source, checkpoint_key, checkpoint_value, synced_at from public.external_sync_checkpoints order by synced_at desc limit 20;"
```

## 5) Expected page behavior

For `https://<web-domain>/polymarket`:

- If API returns non-empty array: page renders synced market rows.
- If API returns `[]`: page renders the empty state message.
- If API call fails (network/500/misconfig): page renders the load error message.
