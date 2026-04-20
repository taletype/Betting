# Runbook: External-sync worker

## Run
```bash
pnpm --filter @bet/external-sync-worker dev
```

Behavior: one-shot market sync from Polymarket + Kalshi, then exits.

## Inspect synced data
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select source, external_id, title, status, last_synced_at from public.external_markets order by last_synced_at desc nulls last limit 30;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select external_market_id, external_outcome_id, title, best_bid, best_ask, last_price, updated_at from public.external_outcomes order by updated_at desc limit 40;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select external_market_id, external_trade_id, side, price, size, traded_at from public.external_trade_ticks order by traded_at desc limit 40;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select source, checkpoint_key, checkpoint_value, synced_at from public.external_sync_checkpoints order by synced_at desc limit 20;"
```

## Expected transitions
- `external_markets.last_synced_at` updates every run.
- `external_sync_checkpoints` upserts `checkpoint_key='last_market_sync'` per source.

## Containment
- If upstream vendor/API is unstable, stop running external-sync worker.
- Trading/matching/ledger are independent; keep core stack running.
