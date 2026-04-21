# Runbook: DB reset + seed

## Standard reset (local)
```bash
supabase db reset --local --yes
```

Or use repo helper (recommended):
```bash
pnpm db:reset
```

`pnpm db:reset` runs:
1) `supabase db reset --local --yes`
2) `pnpm --filter @bet/service-api test:db-happy-path`

For launch signoff artifacts (recommended command path):

```bash
SMOKE_DB_PREP_MODE=reset-local pnpm smoke:db
```

This command writes `infra/artifacts/smoke-db/latest.log` and `infra/artifacts/smoke-db/latest.json`.

## Verify key seeded records
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, username from public.profiles order by created_at;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, slug, status from public.markets order by id;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, market_id, title from public.outcomes order by market_id, title;"
```

## Verify post-seed trading/ledger state
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, status, matching_processed_at from public.orders order by created_at desc limit 20;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, market_id, sequence, matched_at from public.trades order by matched_at desc limit 20;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select journal_kind, reference, created_at from public.ledger_journals order by created_at desc limit 30;"
```


## Demo-mode reseed (staging/local walkthrough)
Use this when you want non-empty pages across Markets, Market Detail, Portfolio, Admin, and External Markets.

```bash
supabase start
pnpm db:reset
```

This performs local reset + seed + DB happy-path verification.

### Demo data checklist queries
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id, slug, status, close_time, resolve_time from public.markets order by close_time asc nulls last;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select market_id, side, status, count(*) as n from public.orders group by market_id, side, status order by market_id, side, status;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select market_id, count(*) as trades, max(matched_at) as latest_trade from public.trades group by market_id order by latest_trade desc nulls last;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select user_id, sum(claimable_amount) as claimable, sum(claimed_amount) as claimed from public.claims group by user_id order by user_id;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select user_id, tx_hash, amount, tx_status, verified_at from public.chain_deposits order by verified_at desc;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select user_id, status, amount, destination_address, tx_hash, created_at from public.withdrawals order by created_at desc;"
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select source, external_id, status, best_bid, best_ask, last_trade_price, volume_total from public.external_markets order by source, external_id;"
```

Expected highlights after reseed:
- multiple open markets plus one resolved market,
- at least one near-closing market (`shanghai-rain-weekend`),
- both bid and ask resting orders in several markets,
- recent trades in multiple markets,
- linked wallet + deposits + withdrawals + claims for demo portfolio,
- external market rows with outcomes and trade ticks.
