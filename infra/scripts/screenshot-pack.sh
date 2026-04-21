#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BASE_URL="${SCREENSHOT_BASE_URL:-http://127.0.0.1:3000}"
ACTIVE_MARKET_ID="${SCREENSHOT_ACTIVE_MARKET_ID:-11111111-1111-4111-8111-111111111111}"
RESOLVED_MARKET_ID="${SCREENSHOT_RESOLVED_MARKET_ID:-13131313-1313-4131-8131-131313131313}"

STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
ARTIFACT_ROOT="${SCREENSHOT_ARTIFACT_DIR:-infra/artifacts/screenshot-pack}"
OUT_DIR="$ARTIFACT_ROOT/$STAMP"
LATEST_DIR="$ARTIFACT_ROOT/latest"

mkdir -p "$OUT_DIR"

note() {
  echo "ℹ️  $1"
}

capture() {
  local filename="$1"
  local path="$2"
  local url="${BASE_URL}${path}"

  note "Capturing ${url} -> ${filename}"
  pnpm dlx playwright@1.51.1 screenshot \
    --browser=chromium \
    --device="Desktop Chrome" \
    --full-page \
    "$url" \
    "$OUT_DIR/$filename"
}

note "Installing Chromium runtime for Playwright (one-time per environment)."
pnpm dlx playwright@1.51.1 install chromium

capture "markets-list.png" "/markets"
capture "market-active-detail.png" "/markets/${ACTIVE_MARKET_ID}"
capture "market-resolved-detail.png" "/markets/${RESOLVED_MARKET_ID}"
capture "portfolio.png" "/portfolio"
capture "claims.png" "/claims"
capture "admin.png" "/admin"
capture "external-markets.png" "/external-markets"

cat > "$OUT_DIR/README.md" <<README
# Screenshot Pack

Generated at (UTC): $STAMP

Base URL: $BASE_URL

Files:
- markets-list.png
- market-active-detail.png
- market-resolved-detail.png
- portfolio.png
- claims.png
- admin.png
- external-markets.png

Market IDs:
- active: $ACTIVE_MARKET_ID
- resolved: $RESOLVED_MARKET_ID
README

rm -rf "$LATEST_DIR"
mkdir -p "$LATEST_DIR"
cp "$OUT_DIR"/*.png "$LATEST_DIR/"
cp "$OUT_DIR/README.md" "$LATEST_DIR/README.md"

note "Screenshot pack saved: $OUT_DIR"
note "Latest screenshot pack: $LATEST_DIR"
