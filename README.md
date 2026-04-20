# Bet Monorepo

Prediction market monorepo scaffold for Next.js on Vercel, Supabase, deterministic workers, and append-only ledger-based balance accounting.

## Workspace Layout

- `apps/web`: Next.js frontend and Vercel cron routes
- `services/api`: REST API service
- `apps/ws`: websocket server
- `services/*-worker`: background workers (matching, external sync, settlement, reconciliation)
- `packages/*`: shared domain, contracts, ledger, chain, integrations, config
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
- `NEXT_PUBLIC_WS_URL` (recommended: `ws://localhost:4001/ws`)

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

1. API + WS

   ```bash
   pnpm dev:api
   ```

2. Workers

   ```bash
   pnpm dev:workers
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
- API `/ready`
- web route availability (`http://127.0.0.1:3000`)
- WS boot (`http://127.0.0.1:4001/health`)
- seed data presence (`public.markets` + `public.outcomes`)

If a check fails, the script prints clear next steps and targeted remediation hints for each failed check.

## Root Scripts

- `pnpm dev` → full local stack orchestration (web + api + ws + all workers)
- `pnpm dev:web` → web only
- `pnpm dev:api` → api + ws
- `pnpm dev:ws` → ws only
- `pnpm dev:workers` → matching + external-sync + settlement + reconciliation workers
- `pnpm db:reset` → local Supabase reset + happy-path DB verification
- `pnpm smoke:local` → local environment smoke checks
- `pnpm load:launch` → narrow launch-path load harness (reads, order burst, ws fan-in)

## Notes

- Money, quantities, balances, and payouts use integers only.
- Balance changes must flow through append-only ledger journals and entries.
- External market sync stays read-only and never mutates balances directly.
- Chain support is adapter-shaped; Base comes first and Solana remains a stub surface for later work.

## Load Harness

- Run `pnpm load:launch` for a narrow launch-path performance check.
- See `infra/docs/load-testing.md` for setup, thresholds, and tuning knobs.
