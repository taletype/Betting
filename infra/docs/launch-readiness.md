# Launch Readiness Hardening Report

> This document is a hardening snapshot captured on 2026-04-20.
> For the active RC freeze checklist and merge plan, use `infra/docs/release-candidate-freeze-plan.md`.

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

## DB-backed launch smoke command (CI/staging ready)

Use a single command for DB lifecycle smoke evidence:

```bash
pnpm smoke:db
```

What it does:

1. checks DB connectivity against `SUPABASE_DB_URL` or `DATABASE_URL`,
2. optionally runs migrations/seed/reset based on `SMOKE_DB_PREP_MODE`,
3. runs the DB happy-path smoke script,
4. exits non-zero on any failure,
5. stores launch artifacts.

### Prep controls

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

The JSON artifact includes final balances, trades, positions, claim state, and withdrawals when available.

## Manual-only / environment-limited

- DB-backed smoke requires a reachable Postgres/Supabase database and seeded launch fixtures (market `77777777-7777-4777-8777-777777777777` and outcome `88888888-8888-4888-8888-888888888888`).

## Current known blockers

### Must fix before launch

- Execute `pnpm smoke:db` in CI/staging DB-enabled environment and attach `infra/artifacts/smoke-db/latest.log` + `latest.json` to launch signoff.

### Should fix soon after launch

- Add a dedicated CI workflow/job that runs `pnpm smoke:db` against an ephemeral DB and uploads the generated artifacts.

### Acceptable to defer

- Expand smoke harness to cover admin execute withdrawal path (currently fail path is covered to validate ledger reversal deterministically).

## Launch recommendation

**Ready with evidence step pending**: launch hardening is in place and a single DB-backed smoke command now produces reusable artifacts; final go-live signoff still requires one passing CI/staging artifact run.
