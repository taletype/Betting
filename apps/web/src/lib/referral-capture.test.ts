import assert from "node:assert/strict";
import test from "node:test";

import {
  appendReferralToInternalHref,
  createReferralApplyIdempotencyKey,
  normalizeReferralCode,
  readReferralCodeFromSearch,
  selectReferralCodeToPersist,
} from "./referral-capture";

test("referral code is captured from query string before login", () => {
  assert.equal(readReferralCodeFromSearch("?ref=hkref001"), "HKREF001");
  assert.equal(readReferralCodeFromSearch("ref=HK-001"), "HK-001");
});

test("invalid referral codes are ignored", () => {
  assert.equal(normalizeReferralCode("x"), null);
  assert.equal(readReferralCodeFromSearch("?ref=%E2%9C%93"), null);
});

test("first valid pending referral wins before login", () => {
  assert.equal(selectReferralCodeToPersist(null, "friend001"), "FRIEND001");
  assert.equal(selectReferralCodeToPersist("FRIEND001", "other002"), null);
  assert.equal(selectReferralCodeToPersist(null, "x"), null);
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
