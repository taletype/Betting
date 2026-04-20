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
    echo "Stopping workers..."
    kill "${pids[@]}" >/dev/null 2>&1 || true
    wait "${pids[@]}" >/dev/null 2>&1 || true
  fi
  exit "$code"
}

trap cleanup INT TERM EXIT

workers=(
  @bet/matching-worker
  @bet/external-sync-worker
  @bet/settlement-worker
  @bet/reconciliation-worker
)

for worker in "${workers[@]}"; do
  echo "Starting ${worker}..."
  pnpm --filter "$worker" dev &
  pids+=("$!")
done

echo "Workers are running. Press Ctrl+C to stop."
wait
