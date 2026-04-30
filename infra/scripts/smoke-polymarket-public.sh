#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-}"
REF_CODE="${REF_CODE:-TESTCODE}"
MARKET_SLUG="${MARKET_SLUG:-}"

if [[ -z "$BASE_URL" ]]; then
  echo "Set BASE_URL, for example BASE_URL=https://preview.example.com pnpm smoke:polymarket-public" >&2
  exit 2
fi

BASE_URL="${BASE_URL%/}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

fetch() {
  local path="$1"
  local allow_404="${2:-yes}"
  local out="$tmp_dir/$(echo "$path" | tr '/?=&:' '______').txt"
  local status
  status="$(curl -sS -L -o "$out" -w "%{http_code}" "$BASE_URL$path")" || fail "request failed: $path"
  if [[ "$allow_404" == "yes" ]]; then
    [[ "$status" =~ ^(2|3)[0-9][0-9]$|^404$ ]] || fail "$path returned HTTP $status"
  else
    [[ "$status" =~ ^(2|3)[0-9][0-9]$ ]] || fail "$path returned HTTP $status"
  fi
  if grep -Eiq '(SUPABASE_SERVICE_ROLE_KEY|POLYMARKET_API_SECRET|PRIVATE_KEY|BEGIN PRIVATE KEY|authorization: bearer|passphrase|connection string)' "$out"; then
    fail "$path response appears to contain a secret"
  fi
  echo "$out"
}

root="$(fetch "/" no)"
grep -Eq 'Polymarket|預測|市場|推薦' "$root" || fail "/ did not include expected public portal copy"
grep -Eiq 'automatic payout|auto payout|guaranteed earning|guaranteed income|保證收入|自動支付' "$root" && fail "/ includes prohibited payout or guarantee wording"

poly="$(fetch "/polymarket" no)"
grep -Eq 'Polymarket|預測|市場' "$poly" || fail "/polymarket did not include zh-HK Polymarket market copy"
grep -Eiq 'live trading enabled|submit order now|automatic payout|auto payout|保證收入|自動支付' "$poly" && fail "/polymarket includes unsafe live-trading or payout wording"

fetch "/polymarket?ref=$(printf '%s' "$REF_CODE" | sed 's/ /%20/g')" no >/dev/null
fetch "/api/health" no >/dev/null
fetch "/api/version" no >/dev/null
markets_json="$(fetch "/api/external/markets" no)"

if [[ -z "$MARKET_SLUG" ]]; then
  MARKET_SLUG="$(node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const m=Array.isArray(data)?data.find(x=>x&&x.source==="polymarket"):null; if(m) console.log(m.slug||m.externalId||m.id);' "$markets_json")"
fi

if [[ -n "$MARKET_SLUG" ]]; then
  fetch "/polymarket/$MARKET_SLUG" >/dev/null
  fetch "/api/external/markets/polymarket/$MARKET_SLUG" >/dev/null
  fetch "/api/external/markets/polymarket/$MARKET_SLUG/orderbook" >/dev/null
  fetch "/api/external/markets/polymarket/$MARKET_SLUG/trades" >/dev/null
  fetch "/api/external/markets/polymarket/$MARKET_SLUG/history" >/dev/null
  fetch "/api/external/markets/polymarket/$MARKET_SLUG/stats" >/dev/null
else
  echo "No Polymarket market found in /api/external/markets; detail smoke skipped."
fi

echo "Polymarket public portal smoke passed for $BASE_URL"
