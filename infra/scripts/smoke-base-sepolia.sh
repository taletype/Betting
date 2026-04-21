#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

export SMOKE_DB_PREP_MODE="${SMOKE_DB_PREP_MODE:-none}"
export BASE_CHAIN_ID="${BASE_CHAIN_ID:-84532}"

if [[ "${BASE_CHAIN_ID}" != "84532" ]]; then
  echo "❌ BASE_CHAIN_ID must be 84532 for Base Sepolia smoke runs. Received: ${BASE_CHAIN_ID}"
  exit 1
fi

echo "ℹ️ Running Base Sepolia DB smoke with BASE_CHAIN_ID=${BASE_CHAIN_ID} and SMOKE_DB_PREP_MODE=${SMOKE_DB_PREP_MODE}"

./infra/scripts/smoke-db.sh
