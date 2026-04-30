#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-${NEXT_PUBLIC_SITE_URL:-http://127.0.0.1:3000}}"
BASE_URL="${BASE_URL%/}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fetch() {
  local path="$1"
  local output="$2"
  curl -fsS --max-time "${SMOKE_TIMEOUT_SECONDS:-20}" "$BASE_URL$path" -o "$output"
}

assert_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if ! grep -Eq "$pattern" "$file"; then
    echo "❌ $message"
    echo "Checked: $file"
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  if grep -Eq "$pattern" "$file"; then
    echo "❌ $message"
    echo "Checked: $file"
    exit 1
  fi
}

echo "Supabase Auth public smoke BASE_URL=$BASE_URL"

fetch "/login" "$tmp_dir/login.html"
assert_contains "$tmp_dir/login.html" "登入" "/login did not render login copy"
assert_not_contains "$tmp_dir/login.html" "Auth 未完成設定|auth unavailable" "/login showed auth unavailable"

fetch "/signup?ref=TESTCODE" "$tmp_dir/signup.html"
assert_contains "$tmp_dir/signup.html" "註冊" "/signup did not render signup copy"
assert_contains "$tmp_dir/signup.html" "TESTCODE" "/signup did not preserve pending referral code"
assert_not_contains "$tmp_dir/signup.html" "Auth 未完成設定|auth unavailable" "/signup showed auth unavailable"

fetch "/account" "$tmp_dir/account.html"
assert_contains "$tmp_dir/account.html" "登入|帳戶" "/account did not render logged-out account/login state"

fetch "/?ref=TESTCODE" "$tmp_dir/home-ref.html"
assert_contains "$tmp_dir/home-ref.html" "ref=TESTCODE|推薦|邀請" "/?ref=TESTCODE did not render referral funnel page"

fetch "/polymarket?ref=TESTCODE" "$tmp_dir/polymarket-ref.html"
assert_contains "$tmp_dir/polymarket-ref.html" "Polymarket|TESTCODE|推薦" "/polymarket?ref=TESTCODE did not render referral-aware market page"

curl -fsS --max-time "${SMOKE_TIMEOUT_SECONDS:-20}" "$BASE_URL/api/external/markets" -o "$tmp_dir/markets.json"
assert_contains "$tmp_dir/markets.json" '"markets"|"data"|"fallbackUsed"' "/api/external/markets did not return market or fallback payload"

echo "Supabase Auth public smoke completed for $BASE_URL"
