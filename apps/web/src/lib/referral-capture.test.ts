import assert from "node:assert/strict";
import test from "node:test";

import {
  appendReferralToInternalHref,
  createReferralApplyIdempotencyKey,
  isTerminalReferralApplyFailure,
  normalizeReferralCode,
  readReferralCodeFromSearch,
  selectReferralCodeToPersist,
} from "./referral-capture";
import { mapReferralRejectionReason } from "./referral-ui";

test("referral code is captured from query string before login", () => {
  assert.equal(readReferralCodeFromSearch("?ref=hkref001"), "HKREF001");
  assert.equal(readReferralCodeFromSearch("ref=HK-001"), "HK-001");
});

test("TESTCODE referral survives public Polymarket navigation", () => {
  assert.equal(readReferralCodeFromSearch("?ref=TESTCODE"), "TESTCODE");
  assert.equal(appendReferralToInternalHref("/polymarket", "http://127.0.0.1:3000/?ref=TESTCODE", "TESTCODE"), "/polymarket?ref=TESTCODE");
  assert.equal(appendReferralToInternalHref("/polymarket/demo-market", "http://127.0.0.1:3000/polymarket?ref=TESTCODE", "TESTCODE"), "/polymarket/demo-market?ref=TESTCODE");
});

test("invalid referral codes are ignored", () => {
  assert.equal(normalizeReferralCode("x"), null);
  assert.equal(readReferralCodeFromSearch("?ref=%E2%9C%93"), null);
});

test("first valid pending referral wins before login", () => {
  assert.equal(selectReferralCodeToPersist(null, "friend001"), "FRIEND001");
  assert.equal(selectReferralCodeToPersist("FRIEND001", "other002"), null);
  assert.equal(selectReferralCodeToPersist(null, "x"), null);
  assert.equal(selectReferralCodeToPersist("TESTCODE", "%E2%9C%93"), null);
  assert.equal(selectReferralCodeToPersist("TESTCODE", "OTHER002"), null);
});

test("pending referral survives internal navigation and existing refs win", () => {
  assert.equal(
    appendReferralToInternalHref("/polymarket/poly-1#ticket", "http://127.0.0.1:3000/?ref=friend001", "friend001"),
    "/polymarket/poly-1?ref=FRIEND001#ticket",
  );
  assert.equal(
    appendReferralToInternalHref("/polymarket?ref=FIRST001", "http://127.0.0.1:3000/", "other002"),
    "/polymarket?ref=FIRST001",
  );
  assert.equal(
    appendReferralToInternalHref("https://polymarket.com/event/abc", "http://127.0.0.1:3000/", "friend001"),
    "https://polymarket.com/event/abc",
  );
});

test("referral apply idempotency key is code-scoped and normalized", () => {
  assert.equal(createReferralApplyIdempotencyKey("friend001"), "referral-apply:FRIEND001");
  assert.equal(createReferralApplyIdempotencyKey("x"), null);
});

test("referral rejection reasons are safe user-facing copy", () => {
  assert.equal(mapReferralRejectionReason("invalid ambassador code"), "推薦碼無效");
  assert.equal(mapReferralRejectionReason("ambassador code is malformed"), "推薦碼無效");
  assert.equal(mapReferralRejectionReason("ambassador code is disabled"), "推薦碼已停用");
  assert.equal(mapReferralRejectionReason("self-referrals are not allowed"), "不能使用自己的推薦碼");
  assert.equal(mapReferralRejectionReason("same_user_multiple_ref_codes"), "已有推薦來源");
});

test("pending referral clears only after terminal apply failures", () => {
  assert.equal(isTerminalReferralApplyFailure(400, "ambassador code is malformed"), true);
  assert.equal(isTerminalReferralApplyFailure(400, "invalid ambassador code"), true);
  assert.equal(isTerminalReferralApplyFailure(400, "ambassador code is disabled"), true);
  assert.equal(isTerminalReferralApplyFailure(400, "self-referrals are not allowed"), true);
  assert.equal(isTerminalReferralApplyFailure(500, "database unavailable"), false);
  assert.equal(isTerminalReferralApplyFailure(401, "Authentication required"), false);
  assert.equal(isTerminalReferralApplyFailure(429, "rate limited"), false);
});
