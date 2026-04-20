#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
BASE_ARTIFACT_DIR="${DRILL_ARTIFACT_DIR:-infra/artifacts/launch-drill}"
ARTIFACT_DIR="$BASE_ARTIFACT_DIR/$TIMESTAMP"
LOG_FILE="$ARTIFACT_DIR/drill.log"
COMMAND_LOG="$ARTIFACT_DIR/commands.log"

API_URL="${API_URL:-http://127.0.0.1:4000}"
WS_HEALTH_URL="${WS_HEALTH_URL:-http://127.0.0.1:4001/health}"
DRILL_DB_URL="${DRILL_DB_URL:-${SUPABASE_DB_URL:-${DATABASE_URL:-}}}"
DRILL_FIXTURE_CMD="${DRILL_FIXTURE_CMD:-pnpm db:reset}"
DRILL_SKIP_FIXTURE="${DRILL_SKIP_FIXTURE:-0}"
DRILL_RUN_HAPPY_PATH="${DRILL_RUN_HAPPY_PATH:-1}"

mkdir -p "$ARTIFACT_DIR"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "$LOG_FILE"
}

run() {
  local label="$1"
  shift
  log "STEP: $label"
  printf '\n### %s\n$ %s\n' "$label" "$*" >>"$COMMAND_LOG"
  "$@" 2>&1 | tee -a "$LOG_FILE"
}

save_query() {
  local name="$1"
  local sql="$2"
  if [[ -z "$DRILL_DB_URL" ]]; then
    log "SKIP: query '$name' (DRILL_DB_URL/SUPABASE_DB_URL/DATABASE_URL not set)"
    return
  fi

  if ! command -v psql >/dev/null 2>&1; then
    log "SKIP: query '$name' (psql not installed)"
    return
  fi

  log "ARTIFACT: query snapshot '$name'"
  psql "$DRILL_DB_URL" -X -v ON_ERROR_STOP=1 -c "$sql" >"$ARTIFACT_DIR/${name}.txt"
}

run_with_logfile() {
  local label="$1"
  local outfile="$2"
  shift 2
  log "STEP: $label"
  printf '\n### %s\n$ %s\n' "$label" "$*" >>"$COMMAND_LOG"
  "$@" >"$outfile" 2>&1
  cat "$outfile" >>"$LOG_FILE"
}

cat >"$ARTIFACT_DIR/README.md" <<README
# Staging launch drill artifacts

- Timestamp (UTC): $TIMESTAMP
- API_URL: $API_URL
- WS_HEALTH_URL: $WS_HEALTH_URL
- Drill DB URL source: DRILL_DB_URL > SUPABASE_DB_URL > DATABASE_URL

## Files
- \`drill.log\`: full execution log (fail-fast steps + outputs)
- \`commands.log\`: exact command order run by the script
- \`*.txt\`: SQL/HTTP snapshots for operator evidence
- \`manual-checklist.md\`: operator sign-off list for manual checks and screenshots/log attachments
README

log "Artifacts directory: $ARTIFACT_DIR"
run "Validate environment" ./infra/scripts/check-env.sh

if [[ "$DRILL_SKIP_FIXTURE" == "1" ]]; then
  log "Fixture step skipped (DRILL_SKIP_FIXTURE=1)."
else
  run "Reset/seed or fixture load" bash -lc "$DRILL_FIXTURE_CMD"
fi

run "API health" curl -fsS "$API_URL/health"
run "API readiness" curl -fsS "$API_URL/ready"
run "Websocket health" curl -fsS "$WS_HEALTH_URL"

if [[ "$DRILL_RUN_HAPPY_PATH" == "1" ]]; then
  run_with_logfile "DB happy-path lifecycle (deposit/match/resolve/claim/withdraw-fail)" \
    "$ARTIFACT_DIR/db-happy-path.log" \
    pnpm --filter @bet/service-api test:db-happy-path
fi

save_query "balances_snapshot" "select account_code, direction, amount, currency, created_at from public.ledger_entries order by created_at desc limit 120;"
save_query "open_orders_snapshot" "select id, user_id, market_id, side, status, price, remaining_quantity, reserved_amount, updated_at from public.orders where status in ('open','partially_filled') order by updated_at desc limit 100;"
save_query "trades_snapshot" "select id, market_id, price, quantity, sequence, matched_at from public.trades order by matched_at desc, sequence desc limit 100;"
save_query "positions_snapshot" "select user_id, market_id, outcome_id, quantity, average_entry_price, updated_at from public.positions order by updated_at desc limit 100;"
save_query "claims_snapshot" "select id, user_id, market_id, status, claimable_amount, claimed_amount, resolution_id, updated_at from public.claims order by updated_at desc limit 100;"
save_query "withdrawals_snapshot" "select id, user_id, status, amount, tx_hash, failure_reason, processed_by, processed_at, created_at from public.withdrawals order by created_at desc limit 100;"
save_query "worker_health_matching_commands" "select id, attempt_count, processed_at, available_at, last_error from public.matching_commands order by created_at desc limit 100;"
save_query "websocket_sequences_snapshot" "select market_id, sequence, updated_at from public.market_realtime_sequences order by updated_at desc limit 100;"
save_query "external_sync_snapshot" "select source, checkpoint_key, checkpoint_value, synced_at from public.external_sync_checkpoints order by synced_at desc limit 100;"

cat >"$ARTIFACT_DIR/manual-checklist.md" <<'MANUAL'
# Manual launch drill checks (operator sign-off)

Record initials + timestamp for each item and attach screenshot/log file names where asked.

## 1) Deposit verification
- [ ] Execute `/deposits/verify` with a known staging-safe tx hash.
- [ ] Confirm `chain_deposits.tx_status=confirmed` and ledger journal kind `deposit_confirmed`.

## 2) Maker/taker match
- [ ] Place resting maker order.
- [ ] Place crossing taker order.
- [ ] Confirm trade row inserted and both order statuses/remaining quantities updated.

## 3) Market resolution + claim
- [ ] Resolve target market using admin endpoint.
- [ ] Confirm resolution row status finalized.
- [ ] Execute claim and verify payout journal + updated claim state.

## 4) Withdrawal request + admin paths
- [ ] Create withdrawal request and verify `requested` status.
- [ ] Execute one withdrawal (`/admin/withdrawals/:id/execute`) and verify `completed` state + tx hash.
- [ ] Fail one withdrawal (`/admin/withdrawals/:id/fail`) and verify `failed` state + reason.

## 5) Reconciliation + health checks
- [ ] Run reconciliation worker check pass and capture output.
- [ ] Confirm websocket sequence is advancing for active markets.
- [ ] Run external-sync worker smoke and confirm checkpoint freshness.

## 6) Human evidence checklist
- [ ] Balances verified (ledger snapshots + account totals).
- [ ] Open orders verified.
- [ ] Trades verified.
- [ ] Positions verified.
- [ ] Claims verified.
- [ ] Withdrawals verified.
- [ ] Worker health verified (matching/deposit/reconciliation/external sync).
- [ ] Dashboard screenshots and/or logs attached.
MANUAL

log "Drill bootstrap complete. Continue with infra/docs/runbooks/staging-launch-drill.md using artifacts in $ARTIFACT_DIR"
