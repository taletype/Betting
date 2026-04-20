# Runbook: Staging launch drill (repeatable dress rehearsal)

This runbook validates the full launch lifecycle in staging-like conditions without adding product features.

## Goal

One operator can execute a repeatable pre-launch drill and produce evidence artifacts for:

- environment boot
- DB reset/seed or staging-safe fixture load
- deposit verification
- maker/taker match
- market resolution
- claim
- withdrawal request
- admin execute/fail
- reconciliation pass
- websocket smoke
- external sync smoke

## Artifact location

- Default: `infra/artifacts/launch-drill/<UTC timestamp>/`
- Override base directory with `DRILL_ARTIFACT_DIR=/path`

Expected generated files:

- `drill.log` (full fail-fast output)
- `commands.log` (exact command sequence)
- `*.txt` snapshots (balances, orders, trades, positions, claims, withdrawals, worker health, WS, external sync)
- `manual-checklist.md` (human sign-off sheet)

## Quick start (recommended)

```bash
# 1) Run scripted bootstrap + evidence capture.
pnpm drill:staging

# Optional overrides:
# DRILL_SKIP_FIXTURE=1 pnpm drill:staging
# DRILL_FIXTURE_CMD="pnpm db:reset" pnpm drill:staging
# DRILL_FIXTURE_CMD="pnpm --filter @bet/service-api exec node --import tsx src/scripts/load-staging-fixtures.ts" pnpm drill:staging
# DRILL_DB_URL="postgresql://..." pnpm drill:staging
```

The script fails fast on health failures (`check-env`, API `/health`, API `/ready`, WS `/health`).

## Full drill checklist

### 1) Environment boot

```bash
./infra/scripts/check-env.sh
curl -fsS ${API_URL:-http://127.0.0.1:4000}/health
curl -fsS ${API_URL:-http://127.0.0.1:4000}/ready
curl -fsS ${WS_HEALTH_URL:-http://127.0.0.1:4001/health}
```

### 2) DB reset/seed or staging-safe fixture load

Use exactly one explicit command for this run and record it in the artifacts:

```bash
# Local reset + seed
pnpm db:reset

# OR staging-safe fixture load command
<your_staging_fixture_command>
```

### 3) Deposit verification

Reference: `infra/docs/runbooks/deposit-verification.md`.

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/deposits/verify \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"txHash":"0x<staging_safe_tx_hash>"}'
```

### 4) Maker/taker match

Place a resting order then a crossing order (via API/UI), then capture evidence:

```bash
psql "$DRILL_DB_URL" -c "select id, side, status, remaining_quantity, price, updated_at from public.orders order by updated_at desc limit 20;"
psql "$DRILL_DB_URL" -c "select id, market_id, price, quantity, sequence, matched_at from public.trades order by matched_at desc limit 20;"
```

### 5) Market resolution

Reference: `infra/docs/runbooks/market-resolution-claims.md`.

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/admin/markets/<market_id>/resolve \
  -H 'content-type: application/json' \
  -H 'x-admin-token: <admin_token>' \
  -d '{"winningOutcomeId":"<outcome_id>","evidenceText":"drill evidence","evidenceUrl":"https://example.com/drill","resolverId":"drill-operator"}'
```

### 6) Claim

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/claims \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"marketId":"<market_id>"}'
```

### 7) Withdrawal request

```bash
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/withdrawals \
  -H 'content-type: application/json' \
  -H 'x-user-id: 00000000-0000-4000-8000-000000000001' \
  -d '{"amount":"1000000","destinationAddress":"0x<destination>"}'
```

### 8) Admin execute + fail withdrawal

Reference: `infra/docs/runbooks/withdrawals-admin.md`.

```bash
# Execute one
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/admin/withdrawals/<withdrawal_id>/execute \
  -H 'content-type: application/json' \
  -H 'x-admin-token: <admin_token>' \
  -H 'x-user-id: <admin_actor_user_id>' \
  -d '{"txHash":"0x<tx_hash>"}'

# Fail one
curl -sS -X POST ${API_URL:-http://127.0.0.1:4000}/admin/withdrawals/<withdrawal_id>/fail \
  -H 'content-type: application/json' \
  -H 'x-admin-token: <admin_token>' \
  -H 'x-user-id: <admin_actor_user_id>' \
  -d '{"reason":"drill fail path"}'
```

### 9) Reconciliation pass

Reference: `infra/docs/runbooks/reconciliation-worker.md`.

```bash
pnpm --filter @bet/reconciliation-worker dev
```

Capture clean output or explicit failure diagnostics in artifacts.

### 10) Websocket smoke

Reference: `infra/docs/runbooks/websocket-recovery.md`.

```bash
curl -fsS ${WS_HEALTH_URL:-http://127.0.0.1:4001/health}
psql "$DRILL_DB_URL" -c "select market_id, sequence, updated_at from public.market_realtime_sequences order by updated_at desc limit 30;"
```

Confirm sequence advances after new trading activity.

### 11) External sync smoke

Reference: `infra/docs/runbooks/external-sync-worker.md`.

```bash
pnpm --filter @bet/external-sync-worker dev
psql "$DRILL_DB_URL" -c "select source, checkpoint_key, checkpoint_value, synced_at from public.external_sync_checkpoints order by synced_at desc limit 20;"
```

Confirm checkpoint freshness for this drill run.

## Required human checks (must be recorded)

For each item, save either SQL output file, dashboard screenshot, or service log excerpt in the drill artifact folder:

- balances
- open orders
- trades
- positions
- claims
- withdrawals
- worker health
- dashboard screenshots/logs where applicable

Use the generated `manual-checklist.md` as the sign-off sheet.

## Notes for repeatability before go-live

- Keep the same command order across every rehearsal.
- Keep fixture scope staging-safe and explicit (no production data mutation).
- Store every rehearsal under a unique timestamped artifact directory.
- Compare latest drill artifacts against prior run for regressions in lifecycle coverage.
