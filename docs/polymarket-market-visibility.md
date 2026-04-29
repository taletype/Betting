# Polymarket Market Visibility

`/polymarket` is a read-only market browsing page unless routed trading is explicitly enabled and a real submitter is available. Missing `POLY_BUILDER_CODE` must not block market browsing.

## Required Vercel Env

For the web app:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `API_BASE_URL` only when the web app should call a separate API deployment directly
- `NEXT_PUBLIC_API_BASE_URL` only when browser-side code must call that API directly
- `POLYMARKET_ROUTED_TRADING_ENABLED=false`
- `POLYMARKET_SUBMITTER_AVAILABLE=false`
- `POLY_BUILDER_CODE` optional for browsing, required only before routed trading can be reviewed

For the API or external sync worker:

- `SUPABASE_DB_URL` or `DATABASE_URL`
- Polymarket source env from `.env.example`

Do not set `POLYMARKET_ROUTED_TRADING_ENABLED=true` in production until user-owned signing, credential storage, submitter health, and operational review are complete.

## Market Data Routes

The page reads market data from:

- same-site fallback: `/api/external/markets`
- standalone API: `$API_BASE_URL/external/markets`

The Next catch-all route `apps/web/src/app/api/[...path]/route.ts` serves `GET /api/external/markets` by reading Supabase directly. The standalone backend serves `GET /external/markets`.

## Database Read Path

External market browsing reads:

- `external_markets`
- `external_outcomes`
- `external_trade_ticks`

Recent order book snapshots may also be attached by backend APIs from `external_orderbook_snapshots`, but `/polymarket` visibility is driven by the three tables above.

## Run Sync

From the repo root:

```bash
pnpm sync:external
```

For production, run the sync worker with the same database env used by the deployed API or web fallback.

## Curl Checks

Same-site Vercel fallback:

```bash
curl -fsS "https://<web-domain>/api/external/markets"
```

Standalone backend:

```bash
export API_BASE_URL="https://<api-domain>"
curl -fsS "$API_BASE_URL/external/markets"
```

## Empty Table vs API Failure

An API failure usually returns non-2xx or JSON with an `error`/`code`, for example `SUPABASE_ENV_MISSING`, `API_REQUEST_FAILED`, `Endpoint not implemented`, or a 500 from `/external/markets`.

An empty table returns a successful `200` with:

```json
[]
```

Confirm row counts with:

```bash
psql "$SUPABASE_DB_URL" -c "select count(*) from public.external_markets where source = 'polymarket';"
psql "$SUPABASE_DB_URL" -c "select count(*) from public.external_outcomes;"
psql "$SUPABASE_DB_URL" -c "select count(*) from public.external_trade_ticks;"
```

If `/api/external/markets` returns `[]` and the Polymarket count is `0`, the external sync has not run or has not ingested Polymarket rows. If the count is greater than `0` but the route fails, check Supabase env on the web/API deployment and server logs for `/external/markets`.
