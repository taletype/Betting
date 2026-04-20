#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

API_URL="${API_URL:-http://127.0.0.1:4000}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"
WS_HEALTH_URL="${WS_HEALTH_URL:-http://127.0.0.1:4001/health}"

pass() {
  echo "✅ $1"
}

fail() {
  echo "❌ $1"
}

next_steps() {
  echo ""
  echo "Next steps:"
  echo "  1) Ensure Supabase is running: supabase start"
  echo "  2) Ensure env vars are set: ./infra/scripts/check-env.sh"
  echo "  3) Start stack: pnpm dev"
  echo "  4) Re-run smoke checks: pnpm smoke:local"
}

failures=0

echo "Running local smoke checks..."

if pnpm --filter @bet/service-api exec node --import tsx -e "import { createDatabaseClient } from '@bet/db'; const db = createDatabaseClient(); await db.query('select 1'); console.log('db ok');" >/dev/null 2>&1; then
  pass "DB connectivity check passed"
else
  fail "DB connectivity check failed"
  failures=$((failures + 1))
fi

if curl -fsS "$API_URL/health" >/dev/null; then
  pass "API /health responded"
else
  fail "API /health failed at $API_URL/health"
  failures=$((failures + 1))
fi

if curl -fsS "$API_URL/ready" >/dev/null; then
  pass "API /ready responded"
else
  fail "API /ready failed at $API_URL/ready"
  failures=$((failures + 1))
fi

if curl -fsS "$WEB_URL" >/dev/null; then
  pass "Web route is reachable at $WEB_URL"
else
  fail "Web route check failed at $WEB_URL"
  failures=$((failures + 1))
fi

if curl -fsS "$WS_HEALTH_URL" >/dev/null; then
  pass "WS boot check passed via $WS_HEALTH_URL"
else
  fail "WS boot check failed at $WS_HEALTH_URL"
  failures=$((failures + 1))
fi

if ((failures > 0)); then
  echo ""
  fail "Smoke checks failed ($failures checks failed)."
  next_steps
  exit 1
fi

echo ""
pass "All local smoke checks passed."
