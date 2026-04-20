#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

./infra/scripts/check-env.sh

pids=()

cleanup() {
  local code=$?
  if ((${#pids[@]} > 0)); then
    echo ""
    echo "Stopping local stack..."
    kill "${pids[@]}" >/dev/null 2>&1 || true
    wait "${pids[@]}" >/dev/null 2>&1 || true
  fi
  exit "$code"
}

trap cleanup INT TERM EXIT

echo "Starting local stack..."
echo "  - Web: http://127.0.0.1:3000"
echo "  - API: http://127.0.0.1:4000"
echo "  - WS: ws://127.0.0.1:4001/ws"

pnpm --filter @bet/service-api dev &
pids+=("$!")
pnpm --filter @bet/ws dev &
pids+=("$!")
pnpm --filter @bet/matching-worker dev &
pids+=("$!")
pnpm --filter @bet/external-sync-worker dev &
pids+=("$!")
pnpm --filter @bet/settlement-worker dev &
pids+=("$!")
pnpm --filter @bet/reconciliation-worker dev &
pids+=("$!")
pnpm --filter @bet/web dev &
pids+=("$!")

echo "All processes launched. Press Ctrl+C to stop everything."
wait
