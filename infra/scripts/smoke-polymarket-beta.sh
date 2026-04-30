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

fetch_path() {
  local path="$1"
  local out="$tmp_dir/$(printf '%s' "$path" | tr '/?=&:' '______').txt"
  local status
  status="$(curl -sS -L -o "$out" -w "%{http_code}" "$BASE_URL$path")" || fail "request failed url=$BASE_URL$path"
  if grep -Eiq '(SUPABASE_SERVICE_ROLE_KEY|POLYMARKET_API_SECRET|PRIVATE_KEY|BEGIN PRIVATE KEY|authorization: bearer|passphrase|postgres://|postgresql://)' "$out"; then
    fail "response appears to contain a secret url=$BASE_URL$path status=$status"
  fi
  printf '%s\t%s\n' "$status" "$out"
}

expect_public_ok() {
  local path="$1"
  local result status
  result="$(fetch_path "$path")"
  status="$(printf '%s' "$result" | cut -f1)"
  case "$status" in
    2*|3*) echo "PASS public $path status=$status" ;;
    *) fail "$path returned status=$status" ;;
  esac
}

json_field() {
  node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const path = process.argv[2].split(".");
let value = payload;
for (const key of path) value = value?.[key];
if (Array.isArray(value)) console.log(JSON.stringify(value));
else if (value !== undefined && value !== null) console.log(String(value));
' "$1" "$2"
}

echo "Polymarket beta smoke BASE_URL=$BASE_URL"

expect_public_ok "/"
expect_public_ok "/polymarket"
expect_public_ok "/ambassador"
expect_public_ok "/rewards"

markets_result="$(fetch_path "/api/external/markets")"
markets_status="$(printf '%s' "$markets_result" | cut -f1)"
markets_body="$(printf '%s' "$markets_result" | cut -f2)"
[[ "$markets_status" == 200 ]] || fail "/api/external/markets status=$markets_status"

market_slug="$(node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const markets = Array.isArray(payload) ? payload : Array.isArray(payload?.markets) ? payload.markets : [];
const market = markets.find((candidate) => candidate && (candidate.slug || candidate.externalId));
if (market) console.log(market.slug || market.externalId);
' "$markets_body")"

if [[ -n "$market_slug" ]]; then
  expect_public_ok "/polymarket/$market_slug"
else
  echo "WARN no market detail checked because market list is empty"
fi

admin_result="$(fetch_path "/admin/polymarket")"
admin_status="$(printf '%s' "$admin_result" | cut -f1)"
case "$admin_status" in
  3*|401|403) echo "PASS /admin/polymarket requires admin status=$admin_status" ;;
  *) fail "/admin/polymarket did not require admin status=$admin_status" ;;
esac

preview_body="$tmp_dir/preview.json"
preview_status="$(curl -sS -o "$preview_body" -w "%{http_code}" \
  -H 'content-type: application/json' \
  -X POST \
  --data '{"marketSource":"polymarket","marketExternalId":"missing","tokenId":"missing","side":"BUY","price":0.5,"size":5}' \
  "$BASE_URL/api/polymarket/orders/preview")" || fail "preview request failed"
[[ "$preview_status" == 200 ]] || fail "preview status=$preview_status"
if ! json_field "$preview_body" "disabledReasonCodes" | grep -Eq 'auth_required|feature_disabled|builder_code_missing|submitter_unavailable|market_not_tradable'; then
  fail "non-allowlisted unauthenticated preview did not return disabled trading reasons"
fi
echo "PASS non-allowlisted/unauthenticated trade preview is disabled"

if grep -R "localhost" "$tmp_dir" >/dev/null; then
  fail "production-rendered responses contained localhost"
fi

echo "Polymarket beta smoke completed for $BASE_URL"
