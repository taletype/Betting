# Bet Monorepo

Chinese-first Polymarket Builder referral funnel for Next.js on Vercel, Supabase Auth, public Polymarket market browsing, direct-referral reward accounting, and manual/admin-approved payouts.

## Workspace Layout

- `apps/web`: Next.js frontend, public API routes, and referral/reward admin surfaces
- `services/api`: standalone API service for external market and protected referral/admin operations
- `services/external-sync-worker`: optional read-only external market sync worker
- `packages/*`: shared contracts, integrations, Supabase, config, and legacy modules pending deeper service-api quarantine
- `supabase/*`: local Supabase config, migrations, seed data, edge functions
- `infra/*`: local helper scripts and operational docs

## Local Development (Fast Path)

### 0) Prerequisites

- Node.js 20+
- pnpm 10+
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- Docker Desktop (or Docker Engine) for local Supabase

### 1) Install dependencies

```bash
pnpm install
```

### 2) Configure local env vars

```bash
cp .env.example .env.local
```

Fill required values in `.env.local`.

Required local vars:

- `DATABASE_URL`
- `SUPABASE_DB_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `API_BASE_URL`
- `ADMIN_API_TOKEN`

Validate your setup:

```bash
./infra/scripts/check-env.sh
```

### 3) Start local Supabase

```bash
supabase start
```

If this is your first run (or you need a clean reset), use:

```bash
pnpm db:reset
```

This runs `supabase db reset --local --yes` and the API happy-path DB script (`services/api/src/scripts/db-happy-path.ts`).

### 4) Startup order

Recommended startup order for debugging:

1. API

   ```bash
   pnpm dev:api
   ```

2. External market sync, when you want local persisted rows

   ```bash
   pnpm sync:external
   ```

3. Web

   ```bash
   pnpm dev:web
   ```

Or start everything together in one command:

```bash
pnpm dev
```

### 5) Run smoke checks

```bash
pnpm smoke:local
```

`smoke:local` checks:

- DB connectivity
- API `/health`
- web route availability (`http://127.0.0.1:3000`)
- public Polymarket market route availability

If a check fails, the script prints clear next steps and targeted remediation hints for each failed check.

## Root Scripts

- `pnpm dev` → local v1 stack orchestration (web + api + external sync worker)
- `pnpm dev:web` → web only
- `pnpm dev:api` → standalone API service
- `pnpm sync:external` → one-shot read-only sync from public Polymarket + Kalshi APIs into `external_markets`, `external_outcomes`, `external_trade_ticks`, and `external_sync_checkpoints`
- `pnpm db:reset` → local Supabase reset + happy-path DB verification
- `pnpm smoke:local` → local environment smoke checks

## Polymarket Market Sync

Run the default one-shot sync:

```bash
pnpm sync:external
```

This path is read-only and uses public Polymarket APIs for market browsing. The legacy Kalshi mapper remains internal sync code only and is not part of the v1 user-facing funnel. The sync upserts:

- `public.external_markets`
- `public.external_outcomes`
- `public.external_trade_ticks`
- `public.external_sync_checkpoints`

Verify success with:

```bash
curl "http://127.0.0.1:4000/external/markets"
```

Then refresh the Polymarket portal at `/polymarket`.

## Notes

- Reward amounts and payouts use integer atom units only.
- Polymarket market browsing stays read-only and works without `POLY_BUILDER_CODE`.
- External sync stays read-only and never mutates balances directly.
- Polymarket routed trading remains disabled by default and must be non-custodial/user-signed when enabled.
- Referral rewards are direct-referral only; payouts remain manual/admin-approved.
