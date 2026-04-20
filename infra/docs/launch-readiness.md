# Launch Readiness Hardening Report

Date: 2026-04-20

## What was verified

- Workspace baseline build health was restored and verified with full workspace `typecheck` and `test` runs.
- Service API test script was corrected so workspace tests execute real test files rather than failing on a literal glob.
- DB-backed happy-path smoke harness (`services/api/src/scripts/db-happy-path.ts`) was hardened to:
  - use two distinct users for maker/taker flow,
  - verify trade/order/position/funds state transitions,
  - run admin resolution + claim,
  - optionally exercise withdrawal request + admin fail and verify balance restoration when withdrawals are available,
  - print final balances/open orders/positions/trades/claims/withdrawals summary.
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

## Manual-only / environment-limited

- `test:db-happy-path` requires local Postgres/Supabase stack. In this environment it failed with `ECONNREFUSED 127.0.0.1:54322`.
- To run locally once DB is up:
  1. `pnpm db:reset`
  2. `pnpm --filter @bet/service-api test:db-happy-path`

## Current known blockers

### Must fix before launch

- Run the DB-backed happy-path script in a real local/staging DB and record a passing run artifact/log. (Currently blocked only by unavailable local DB in this environment.)

### Should fix soon after launch

- Add CI job(s) that run `test:db-happy-path` against ephemeral DB to prevent regressions in the full lifecycle path.

### Acceptable to defer

- Expand smoke harness to cover admin execute withdrawal path (currently fail path is covered to validate ledger reversal deterministically).

## Launch recommendation

**Ready with caveats**: code-level baseline and automated tests are green, reconciliation and realtime guards are in place, but DB-backed smoke must be run in a DB-enabled environment before go-live signoff.
