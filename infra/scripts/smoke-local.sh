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
  echo "     or in order: pnpm dev:api -> pnpm dev:workers -> pnpm dev:web"
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
  hint "Start API + WS with: pnpm dev:api"
  failures=$((failures + 1))
fi

if curl -fsS "$API_URL/ready" >/dev/null; then
  pass "API /ready responded"
else
  fail "API /ready failed at $API_URL/ready"
  hint "API may be up but not ready; check API logs and DB connectivity"
  failures=$((failures + 1))
fi

if curl -fsS "$WEB_URL" >/dev/null; then
  pass "Web route is reachable at $WEB_URL"
else
  fail "Web route check failed at $WEB_URL"
  hint "Start web with: pnpm dev:web"
  failures=$((failures + 1))
fi

if curl -fsS "$WS_HEALTH_URL" >/dev/null; then
  pass "WS boot check passed via $WS_HEALTH_URL"
else
  fail "WS boot check failed at $WS_HEALTH_URL"
  hint "Start WS with: pnpm dev:ws (or pnpm dev:api)"
  failures=$((failures + 1))
fi

if pnpm --filter @bet/service-api exec node --import tsx -e "import { createDatabaseClient } from '@bet/db'; const db = createDatabaseClient(); const markets = await db.query('select count(*)::int as count from public.markets'); const outcomes = await db.query('select count(*)::int as count from public.outcomes'); if ((markets.rows[0]?.count ?? 0) < 1 || (outcomes.rows[0]?.count ?? 0) < 1) { process.exit(1); }" >/dev/null 2>&1; then
  pass "Seed data presence check passed (markets/outcomes)"
else
  fail "Seed data presence check failed (public.markets/public.outcomes empty or unreachable)"
  hint "Run: pnpm db:reset to apply migrations + seed.sql"
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
