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
