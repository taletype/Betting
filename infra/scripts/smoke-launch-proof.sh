#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ARTIFACT_DIR="${SMOKE_DB_ARTIFACT_DIR:-infra/artifacts/smoke-db}"
RUN_STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
RECON_LOG="$ARTIFACT_DIR/reconciliation-${RUN_STAMP}.log"
LATEST_RECON_LOG="$ARTIFACT_DIR/latest-reconciliation.log"
LAUNCH_PROOF_JSON="$ARTIFACT_DIR/launch-proof-${RUN_STAMP}.json"
LATEST_LAUNCH_PROOF_JSON="$ARTIFACT_DIR/latest-launch-proof.json"

mkdir -p "$ARTIFACT_DIR"

echo "ℹ️ Launch-proof artifact directory: $ARTIFACT_DIR"
echo "ℹ️ Step 1/2: running Base Sepolia lifecycle smoke"
./infra/scripts/smoke-base-sepolia.sh

echo "ℹ️ Step 2/2: running reconciliation worker"
set +e
pnpm --filter @bet/reconciliation-worker dev 2>&1 | tee "$RECON_LOG"
recon_status=${PIPESTATUS[0]}
set -e

cp "$RECON_LOG" "$LATEST_RECON_LOG"

recon_result="passed"
if [[ $recon_status -ne 0 ]]; then
  recon_result="failed"
fi

cat >"$LAUNCH_PROOF_JSON" <<JSON
{
  "generatedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "network": "base-sepolia",
  "chainId": 84532,
  "artifacts": {
    "smokeLog": "$ARTIFACT_DIR/latest.log",
    "smokeJson": "$ARTIFACT_DIR/latest.json",
    "reconciliationLog": "$LATEST_RECON_LOG"
  },
  "reconciliation": {
    "status": "$recon_result",
    "exitCode": $recon_status
  }
}
JSON

cp "$LAUNCH_PROOF_JSON" "$LATEST_LAUNCH_PROOF_JSON"

echo "ℹ️ Launch-proof summary JSON: $LAUNCH_PROOF_JSON"
echo "ℹ️ Latest launch-proof summary: $LATEST_LAUNCH_PROOF_JSON"

if [[ $recon_status -ne 0 ]]; then
  echo "❌ Reconciliation step failed; launch-proof run marked failed."
  exit $recon_status
fi

echo "✅ Launch-proof flow passed"
