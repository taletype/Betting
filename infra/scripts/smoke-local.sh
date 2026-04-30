#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

API_URL="${API_URL:-http://127.0.0.1:4000}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"

pass() {
  echo "✅ $1"
}

fail() {
  echo "❌ $1"
}

hint() {
  echo "   ↳ $1"
}

next_steps() {
  echo ""
  echo "Next steps:"
  echo "  1) Validate env: ./infra/scripts/check-env.sh"
  echo "  2) Ensure local Supabase is running: supabase start"
  echo "  3) If needed, reseed/reset local DB: pnpm db:reset"
  echo "  4) Start stack (all-in-one): pnpm dev"
  echo "     or in order: pnpm dev:api -> pnpm sync:external -> pnpm dev:web"
  echo "  5) Re-run smoke checks: pnpm smoke:local"
}

failures=0

echo "Running local smoke checks..."

if pnpm --filter @bet/service-api exec node --import tsx -e "import { createDatabaseClient } from '@bet/db'; const db = createDatabaseClient(); await db.query('select 1'); console.log('db ok');" >/dev/null 2>&1; then
  pass "DB connectivity check passed"
else
  fail "DB connectivity check failed"
  hint "Confirm DATABASE_URL/SUPABASE_DB_URL and run: supabase status"
  failures=$((failures + 1))
fi

if curl -fsS "$API_URL/health" >/dev/null; then
  pass "API /health responded"
else
  fail "API /health failed at $API_URL/health"
  hint "Start API with: pnpm dev:api"
  failures=$((failures + 1))
fi

if curl -fsS "$API_URL/external/markets" >/dev/null; then
  pass "API /external/markets responded"
else
  fail "API /external/markets failed at $API_URL/external/markets"
  hint "Check API logs and public Polymarket market read configuration"
  failures=$((failures + 1))
fi

if curl -fsS "$WEB_URL" >/dev/null; then
  pass "Web route is reachable at $WEB_URL"
else
  fail "Web route check failed at $WEB_URL"
  hint "Start web with: pnpm dev:web"
  failures=$((failures + 1))
fi

if pnpm --filter @bet/service-api exec node --import tsx -e "import { createDatabaseClient } from '@bet/db'; const db = createDatabaseClient(); await db.query('select count(*)::int as count from public.external_markets');" >/dev/null 2>&1; then
  pass "External market table presence check passed"
else
  fail "External market table check failed"
  hint "Run migrations and then pnpm sync:external if you need persisted Polymarket rows"
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
