#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://betting-web-ten.vercel.app}"
BASE_URL="${BASE_URL%/}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

warn() {
  echo "WARN: $*" >&2
}

secret_pattern='(SUPABASE_SERVICE_ROLE_KEY|POLYMARKET_API_SECRET|PRIVATE_KEY|BEGIN PRIVATE KEY|authorization: bearer|passphrase|connection string|postgres://|postgresql://|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)'

body_file_for_path() {
  printf '%s/%s.txt' "$tmp_dir" "$(printf '%s' "$1" | tr '/?=&:' '______')"
}

fetch_path() {
  local path="$1"
  local out
  local status
  out="$(body_file_for_path "$path")"
  status="$(curl -sS -L -o "$out" -w "%{http_code}" "$BASE_URL$path")" || fail "request failed url=$BASE_URL$path"

  if grep -Eiq "$secret_pattern" "$out"; then
    fail "response appears to contain a secret url=$BASE_URL$path status=$status"
  fi

  printf 'CHECK url=%s status=%s\n' "$BASE_URL$path" "$status" >&2
  printf '%s\t%s\n' "$status" "$out"
}

diagnostic_code() {
  node -e '
const fs = require("fs");
try {
  const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const code = payload && typeof payload === "object"
    ? (payload.error || payload.code || payload.diagnostic || payload.diagnostics?.[0] || "")
    : "";
  if (code) console.log(String(code));
} catch {}
' "$1"
}

market_count() {
  node -e '
const fs = require("fs");
try {
  const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (Array.isArray(payload)) {
    console.log(payload.length);
    process.exit(0);
  }
  if (payload && typeof payload === "object" && Array.isArray(payload.markets)) {
    console.log(payload.markets.length);
    process.exit(0);
  }
  process.exit(2);
} catch {
  process.exit(3);
}
' "$1"
}

open_market_health() {
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const markets = Array.isArray(payload) ? payload : Array.isArray(payload?.markets) ? payload.markets : [];
const open = markets.filter((market) => market && market.status === "open");
const stale = payload && typeof payload === "object" && payload.stale === true;
if (stale) {
  console.error("stale=true");
  process.exit(10);
}
if (markets.length > 0 && open.length === 0) {
  console.error("no open markets; statuses=" + [...new Set(markets.map((market) => market?.status || "unknown"))].join(","));
  process.exit(11);
}
console.log(open.length);
' "$1"
}

check_public_path() {
  local path="$1"
  local result
  local status
  local body
  result="$(fetch_path "$path")"
  status="$(printf '%s\n' "$result" | tail -n 1 | cut -f1)"
  body="$(printf '%s\n' "$result" | tail -n 1 | cut -f2)"

  case "$status" in
    2*|3*) ;;
    401|403)
      fail "$path requires auth but public browsing must not require login url=$BASE_URL$path status=$status"
      ;;
    *)
      fail "$path returned unexpected status url=$BASE_URL$path status=$status diagnostic=$(diagnostic_code "$body")"
      ;;
  esac
}

check_markets() {
  local result
  local status
  local body
  local count
  local code
  result="$(fetch_path "/api/external/markets")"
  status="$(printf '%s\n' "$result" | tail -n 1 | cut -f1)"
  body="$(printf '%s\n' "$result" | tail -n 1 | cut -f2)"
  code="$(diagnostic_code "$body")"

  case "$status" in
    200)
      if ! count="$(market_count "$body")"; then
        fail "/api/external/markets returned HTTP 200 but response has no markets array url=$BASE_URL/api/external/markets diagnostic=$code"
      fi
      printf 'MARKETS url=%s status=%s market_count=%s diagnostic=%s\n' "$BASE_URL/api/external/markets" "$status" "$count" "${code:-none}"
      if [[ "$count" -gt 0 ]]; then
        if ! open_count="$(open_market_health "$body" 2>"$tmp_dir/open-market-health.err")"; then
          fail "/api/external/markets did not return fresh open markets url=$BASE_URL/api/external/markets detail=$(cat "$tmp_dir/open-market-health.err")"
        fi
        printf 'OPEN_MARKETS url=%s open_market_count=%s\n' "$BASE_URL/api/external/markets" "$open_count"
        echo "PASS: /api/external/markets returned public market data"
      else
        warn "/api/external/markets returned an empty array url=$BASE_URL/api/external/markets status=$status market_count=0 diagnostic=${code:-none}"
      fi
      ;;
    401|403)
      fail "/api/external/markets requires auth but public browsing must not require login url=$BASE_URL/api/external/markets status=$status diagnostic=${code:-none}"
      ;;
    503)
      if [[ "$code" == "MARKET_SOURCE_UNAVAILABLE" ]]; then
        fail "/api/external/markets source unavailable url=$BASE_URL/api/external/markets status=$status diagnostic=$code"
      fi
      fail "/api/external/markets returned HTTP 503 url=$BASE_URL/api/external/markets diagnostic=${code:-none}"
      ;;
    500)
      case "$code" in
        SUPABASE_ENV_MISSING|API_REQUEST_FAILED|EXTERNAL_MARKETS_NOT_IMPLEMENTED|MARKET_SOURCE_UNAVAILABLE)
          fail "/api/external/markets returned HTTP 500 with known safe diagnostic; deployment still fails smoke url=$BASE_URL/api/external/markets diagnostic=$code"
          ;;
        *)
          fail "/api/external/markets returned HTTP 500 url=$BASE_URL/api/external/markets diagnostic=${code:-none}"
          ;;
      esac
      ;;
    *)
      fail "/api/external/markets returned unexpected status url=$BASE_URL/api/external/markets status=$status diagnostic=${code:-none}"
      ;;
  esac
}

echo "Polymarket public portal smoke BASE_URL=$BASE_URL"

check_public_path "/"
check_public_path "/polymarket"
check_public_path "/api/health"
check_public_path "/api/version"
check_markets

echo "Polymarket public portal smoke completed for $BASE_URL"
