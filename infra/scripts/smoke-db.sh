#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ARTIFACT_DIR="${SMOKE_DB_ARTIFACT_DIR:-infra/artifacts/smoke-db}"
RUN_STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
ARTIFACT_BASENAME="db-happy-path-${RUN_STAMP}"
LOG_FILE="$ARTIFACT_DIR/${ARTIFACT_BASENAME}.log"
JSON_FILE="$ARTIFACT_DIR/${ARTIFACT_BASENAME}.json"
LATEST_LOG="$ARTIFACT_DIR/latest.log"
LATEST_JSON="$ARTIFACT_DIR/latest.json"

mkdir -p "$ARTIFACT_DIR"

pass() {
  echo "✅ $1"
}

fail() {
  echo "❌ $1"
}

note() {
  echo "ℹ️  $1"
}

run_or_fail() {
  local description="$1"
  shift

  note "$description"
  if "$@"; then
    pass "$description"
  else
    fail "$description"
    exit 1
  fi
}

note "DB smoke artifact directory: $ARTIFACT_DIR"
note "Run log: $LOG_FILE"
note "Run json artifact: $JSON_FILE"

run_or_fail "Checking DB connectivity" \
  pnpm --filter @bet/service-api exec node --import tsx -e "import { createDatabaseClient, getDatabaseConnectionString } from '@bet/db'; const db = createDatabaseClient(); await db.query('select 1 as ok'); console.log('db ok', getDatabaseConnectionString());"

prep_mode="${SMOKE_DB_PREP_MODE:-none}"
case "$prep_mode" in
  none)
    note "Skipping DB reset/migration prep (SMOKE_DB_PREP_MODE=none)."
    ;;
  reset-local)
    run_or_fail "Running local Supabase reset/migrations/seed" supabase db reset --local --yes
    ;;
  reset)
    run_or_fail "Running Supabase reset/migrations/seed" supabase db reset --yes
    ;;
  command)
    if [[ -z "${SMOKE_DB_PREP_CMD:-}" ]]; then
      fail "SMOKE_DB_PREP_MODE=command requires SMOKE_DB_PREP_CMD"
      exit 1
    fi

    note "Running custom DB prep command"
    if bash -lc "$SMOKE_DB_PREP_CMD"; then
      pass "Custom DB prep command"
    else
      fail "Custom DB prep command"
      exit 1
    fi
    ;;
  *)
    fail "Unknown SMOKE_DB_PREP_MODE '$prep_mode' (expected: none|reset-local|reset|command)"
    exit 1
    ;;
esac

note "Executing DB happy-path smoke"
set +e
DB_HAPPY_PATH_ARTIFACT="$JSON_FILE" pnpm --filter @bet/service-api test:db-happy-path 2>&1 | tee "$LOG_FILE"
smoke_status=${PIPESTATUS[0]}
set -e

cp "$LOG_FILE" "$LATEST_LOG"
if [[ -f "$JSON_FILE" ]]; then
  cp "$JSON_FILE" "$LATEST_JSON"
fi

if [[ $smoke_status -ne 0 ]]; then
  fail "DB happy-path smoke failed (exit $smoke_status)."
  note "See log: $LOG_FILE"
  exit $smoke_status
fi

if [[ ! -f "$JSON_FILE" ]]; then
  fail "Smoke passed but JSON artifact missing at $JSON_FILE"
  exit 1
fi

pass "DB happy-path smoke passed"
pass "Artifact log saved: $LOG_FILE"
pass "Artifact json saved: $JSON_FILE"
note "Latest log symlink/copy: $LATEST_LOG"
note "Latest json symlink/copy: $LATEST_JSON"
