# Runbook: External-sync worker

## Run
Use one of the following one-shot triggers:

```bash
pnpm sync:external
# or
pnpm --filter @bet/external-sync-worker run run
# or (admin trigger through API service)
curl -X POST "http://127.0.0.1:4000/admin/external-sync/run" -H "x-admin-token: dev-admin-token"
```

Behavior: read-only market sync from public Polymarket + Kalshi APIs, then exits.

## Inspect synced data
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select source, external_id, title, status, last_synced_at from public.external_markets order by last_synced_at desc nulls last limit 30;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select external_market_id, external_outcome_id, title, best_bid, best_ask, last_price, updated_at from public.external_outcomes order by updated_at desc limit 40;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select external_market_id, external_trade_id, side, price, size, traded_at from public.external_trade_ticks order by traded_at desc limit 40;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select source, checkpoint_key, checkpoint_value, synced_at from public.external_sync_checkpoints order by synced_at desc limit 20;"
```

## Verify API/page
```bash
curl "http://127.0.0.1:4000/external/markets"
curl "http://127.0.0.1:4000/external/markets/polymarket/<externalId>"
```

Then refresh `/external-markets` in the web app.

## Expected transitions
- `external_markets.last_synced_at` updates every run.
- `external_outcomes` and `external_trade_ticks` are upserted idempotently by `(external_market_id, external_outcome_id)` and `(external_market_id, external_trade_id)`.
- `external_sync_checkpoints` upserts `checkpoint_key='last_market_sync'` per source.

## Containment
- If upstream vendor/API is unstable, stop running external-sync worker.
- Trading/matching/ledger tables are not touched by this sync path.
