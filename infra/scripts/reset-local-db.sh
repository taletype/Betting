#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

./infra/scripts/check-env.sh

if ! command -v supabase >/dev/null 2>&1; then
  echo "❌ Supabase CLI is required for db reset."
  exit 1
fi

echo "Resetting local Supabase database..."
supabase db reset --local --yes

echo "Running API happy-path DB verification script..."
pnpm --filter @bet/service-api test:db-happy-path

echo "✅ Local DB reset + happy-path verification complete."
