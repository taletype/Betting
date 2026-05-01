#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://betting-web-ten.vercel.app}"
BASE_URL="${BASE_URL%/}"
DASHBOARD_PATH="${DASHBOARD_PATH:-/api/ambassador/dashboard}"
SESSION_COOKIE="${SESSION_COOKIE:-}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

warn() {
  echo "WARN: $*" >&2
}

fetch_path() {
  local path="$1"
  local out="$tmp_dir/$(printf '%s' "$path" | tr '/?=&:' '______').txt"
  local status
  if [[ -n "$SESSION_COOKIE" ]]; then
    status="$(curl -sS -L -o "$out" -w "%{http_code}" -H "cookie: $SESSION_COOKIE" "$BASE_URL$path")" || fail "request failed url=$BASE_URL$path"
  else
    status="$(curl -sS -L -o "$out" -w "%{http_code}" "$BASE_URL$path")" || fail "request failed url=$BASE_URL$path"
  fi

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

expect_dashboard_shape() {
  local body="$1"

  local code pending payable paid ledger payouts
  code="$(json_field "$body" "ambassadorCode.code")"
  pending="$(json_field "$body" "rewards.pendingRewards")"
  payable="$(json_field "$body" "rewards.payableRewards")"
  paid="$(json_field "$body" "rewards.paidRewards")"
  ledger="$(json_field "$body" "rewardLedger")"
  payouts="$(json_field "$body" "payouts")"

  [[ -n "$code" ]] || fail "dashboard payload missing ambassadorCode.code"
  [[ "$pending" =~ ^[0-9]+$ ]] || fail "dashboard payload missing numeric rewards.pendingRewards"
  [[ "$payable" =~ ^[0-9]+$ ]] || fail "dashboard payload missing numeric rewards.payableRewards"
  [[ "$paid" =~ ^[0-9]+$ ]] || fail "dashboard payload missing numeric rewards.paidRewards"
  [[ "$ledger" == "[]" || "$ledger" == \[* ]] || fail "dashboard payload missing rewardLedger array"
  [[ "$payouts" == "[]" || "$payouts" == \[* ]] || fail "dashboard payload missing payouts array"

  echo "PASS ambassador dashboard returned referral code and reward fields"
  echo "PASS zero-value rewards are accepted when the payload is otherwise valid"
}

echo "Ambassador production smoke BASE_URL=$BASE_URL DASHBOARD_PATH=$DASHBOARD_PATH"

expect_public_ok "/ambassador"
expect_public_ok "/rewards"

dashboard_result="$(fetch_path "$DASHBOARD_PATH")"
dashboard_status="$(printf '%s' "$dashboard_result" | cut -f1)"
dashboard_body="$(printf '%s' "$dashboard_result" | cut -f2)"

if [[ -n "$SESSION_COOKIE" ]]; then
  [[ "$dashboard_status" == "200" ]] || fail "$DASHBOARD_PATH status=$dashboard_status"
  expect_dashboard_shape "$dashboard_body"
else
  case "$dashboard_status" in
    401)
      echo "PASS dashboard route requires authentication when no session cookie is provided"
      warn "Set SESSION_COOKIE='sb-...=...; sb-...=...' to verify a real logged-in dashboard payload in production."
      ;;
    200)
      expect_dashboard_shape "$dashboard_body"
      ;;
    *)
      fail "$DASHBOARD_PATH returned unexpected status=$dashboard_status without SESSION_COOKIE"
      ;;
  esac
fi

echo "Ambassador production smoke completed for $BASE_URL"
