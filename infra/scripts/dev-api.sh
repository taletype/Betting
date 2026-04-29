#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

./infra/scripts/check-env.sh

if [[ -z "${ENV_FILE:-}" ]]; then
  if [[ -f .env.local ]]; then
    ENV_FILE=.env.local
  elif [[ -f .env ]]; then
    ENV_FILE=.env
  else
    ENV_FILE=.env.example
  fi
fi
set -a
source "$ENV_FILE"
set +a

pids=()

cleanup() {
  local code=$?
  if ((${#pids[@]} > 0)); then
    echo ""
    echo "Stopping API/WS services..."
    kill "${pids[@]}" >/dev/null 2>&1 || true
    wait "${pids[@]}" >/dev/null 2>&1 || true
  fi
  exit "$code"
}

trap cleanup INT TERM EXIT

echo "Starting API (http://127.0.0.1:4000)..."
pnpm --filter @bet/service-api dev &
pids+=("$!")

echo "Starting WS (ws://127.0.0.1:4001/ws)..."
pnpm --filter @bet/ws dev &
pids+=("$!")

echo "API + WS are running. Press Ctrl+C to stop."
wait
