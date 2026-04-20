# Local Development Orchestration

## Quick start

```bash
pnpm install
cp .env.example .env.local
./infra/scripts/check-env.sh
supabase start
pnpm db:reset
pnpm dev
pnpm smoke:local
```

## Explicit startup order

1. API + WS: `pnpm dev:api`
2. Workers: `pnpm dev:workers`
3. Web: `pnpm dev:web`
4. Smoke checks: `pnpm smoke:local`

## Script reference

- `infra/scripts/dev.sh`: starts web, api, ws, and workers in one shell session
- `infra/scripts/dev-api.sh`: starts api and ws only
- `infra/scripts/dev-workers.sh`: starts matching, external-sync, settlement, reconciliation workers
- `infra/scripts/check-env.sh`: validates local dependencies and required env vars
- `infra/scripts/reset-local-db.sh`: resets local Supabase database and runs API happy-path DB script
- `infra/scripts/smoke-local.sh`: local smoke checks with actionable failure output

## Supabase local steps

1. Start Supabase services: `supabase start`
2. Verify local containers are healthy: `supabase status`
3. Reset + reseed local database when needed: `pnpm db:reset`
4. Re-run smoke checks after reset: `pnpm smoke:local`
