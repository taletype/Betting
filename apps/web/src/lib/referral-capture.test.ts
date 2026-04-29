import assert from "node:assert/strict";
import test from "node:test";

import { normalizeReferralCode, readReferralCodeFromSearch, selectReferralCodeToPersist } from "./referral-capture";

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
