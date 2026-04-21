# Launch Readiness Hardening Report

> This document is a hardening snapshot captured on 2026-04-20.
> For the active RC freeze checklist and merge plan, use `infra/docs/release-candidate-freeze-plan.md`.
> For launch vs post-launch prioritization, use `infra/docs/v1.0-v1.1-backlog-split.md`.

Date: 2026-04-20

## What was verified

- Workspace baseline build health was restored and verified with full workspace `typecheck` and `test` runs.
- Service API test script was corrected so workspace tests execute real test files rather than failing on a literal glob.
- DB-backed happy-path smoke harness (`services/api/src/scripts/db-happy-path.ts`) was hardened to:
  - use two distinct users for maker/taker flow,
  - verify trade/order/position/funds state transitions,
  - run admin resolution + claim,
  - optionally exercise withdrawal request + admin fail and verify balance restoration when withdrawals are available,
  - print final balances/open orders/positions/trades/claims/withdrawals summary,
  - persist JSON evidence when `DB_HAPPY_PATH_ARTIFACT` is provided.
- Reconciliation coverage verified in `services/reconciliation-worker/src/main.ts` and `baseTreasuryReconciliation.ts` for:
  - ledger journal balance consistency,
  - reserved balance vs open order exposure,
  - positions vs trades consistency,
  - confirmed deposits and completed withdrawals vs chain tx status,
  - duplicate tx hash usage detection,
  - explicit mismatch details with non-zero exit on failures.
- Realtime recovery safety was validated by existing focused reducer tests in `apps/web/src/lib/market-realtime.test.ts` for snapshot sequencing and sequence-gap resync trigger behavior.

## Commands run

- `pnpm typecheck`
- `pnpm test`
- `pnpm --filter @bet/service-api typecheck`
- `pnpm --filter @bet/service-api test`
- `pnpm --filter @bet/reconciliation-worker typecheck`
- `pnpm --filter @bet/service-api test:db-happy-path`

## Base Sepolia launch smoke command (CI/staging ready)

Use this single command for DB lifecycle smoke evidence on staging/prelaunch:

```bash
pnpm smoke:base-sepolia
```

What it does:

1. enforces `BASE_CHAIN_ID=84532` (Base Sepolia),
2. requires explicit DB URL env (`SUPABASE_DB_URL` or `DATABASE_URL`) and checks connectivity,
3. runs the DB happy-path lifecycle (wallet link, deposit verify, resting + crossing orders, trade assertions, resolution, claim, withdrawal execute + fail),
4. prints and persists launch evidence including chain/network info, balances, trades, positions, claims, withdrawals, and tx explorer links,
5. exits non-zero on any failure.

The command uses `SMOKE_DB_PREP_MODE=none` by default. Override prep mode only when you need reset/bootstrap behavior.

### Optional direct command (advanced)

`pnpm smoke:db` is still available for custom prep cases.

## Prerequisites by environment

- **Local Supabase**:
  1. `supabase start`
  2. `export SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`
  3. `export BASE_TREASURY_ADDRESS=<base-sepolia-treasury>`
  4. `export BASE_USDC_ADDRESS=<base-sepolia-usdc>`
  5. `SMOKE_DB_PREP_MODE=reset-local pnpm smoke:base-sepolia`
- **CI/staging ephemeral DB**:
  1. Provision DB and set `SUPABASE_DB_URL` (or `DATABASE_URL`) in the job env.
  2. Set Base Sepolia env values (`BASE_CHAIN_ID=84532`, `BASE_TREASURY_ADDRESS`, `BASE_USDC_ADDRESS`, optional `BASE_EXPLORER_URL`).
  3. Run `pnpm smoke:base-sepolia`.

### Prep controls (when using `pnpm smoke:db` directly)

- `SMOKE_DB_PREP_MODE=none` (default): skip DB reset/migration step.
- `SMOKE_DB_PREP_MODE=reset-local`: run `supabase db reset --local --yes`.
- `SMOKE_DB_PREP_MODE=reset`: run `supabase db reset --yes`.
- `SMOKE_DB_PREP_MODE=command` with `SMOKE_DB_PREP_CMD='<command>'`: run an explicit custom prep command.

### Artifact/log location

Default output directory:

- `infra/artifacts/smoke-db/`

Files created per run:

- `db-happy-path-<UTC timestamp>.log`
- `db-happy-path-<UTC timestamp>.json`
- `latest.log`
- `latest.json`

Launch evidence should be published from:

- `infra/artifacts/smoke-db/latest.log`
- `infra/artifacts/smoke-db/latest.json`

The JSON artifact includes network/chain configuration, tx hashes + explorer links, final balances, trades, positions, claim state, and withdrawal outcomes.

## Legacy generic smoke path

`pnpm smoke:db` remains available and:

1. requires explicit DB URL env (`SUPABASE_DB_URL` or `DATABASE_URL`) and checks connectivity,
2. optionally runs migrations/seed/reset based on `SMOKE_DB_PREP_MODE`,
3. runs the DB happy-path smoke script,
4. exits non-zero on any failure.

## Manual-only / environment-limited

- DB-backed smoke requires a reachable Postgres/Supabase database and seeded launch fixtures (market `77777777-7777-4777-8777-777777777777` and outcome `88888888-8888-4888-8888-888888888888`).
- Optional fixture overrides can be passed via `DB_HAPPY_PATH_MARKET_ID` and `DB_HAPPY_PATH_WINNING_OUTCOME_ID`.

## Current known blockers

### Must fix before launch

- Execute `pnpm smoke:base-sepolia` in CI/staging DB-enabled environment and attach `infra/artifacts/smoke-db/latest.log` + `latest.json` to launch signoff.
- Publish those two files as CI job artifacts (for example: GitHub Actions artifact name `smoke-db`) and link that artifact in the launch signoff ticket.

### Should fix soon after launch

- Add a dedicated CI workflow/job that runs `pnpm smoke:base-sepolia` against an ephemeral DB and uploads the generated artifacts.

### Acceptable to defer

- Add CI automation that uploads smoke evidence artifacts directly into the release signoff ticket/work item.

## Launch recommendation

**Ready with evidence step pending**: launch hardening is in place and a single DB-backed smoke command now produces reusable artifacts; final go-live signoff still requires one passing CI/staging artifact run.
