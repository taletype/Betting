import assert from "node:assert/strict";
import test from "node:test";

import { normalizeReferralCode, readReferralCodeFromSearch } from "./referral-capture";

test("referral code is captured from query string before login", () => {
  assert.equal(readReferralCodeFromSearch("?ref=hkref001"), "HKREF001");
  assert.equal(readReferralCodeFromSearch("ref=HK-001"), "HK-001");
});

test("invalid referral codes are ignored", () => {
  assert.equal(normalizeReferralCode("x"), null);
  assert.equal(readReferralCodeFromSearch("?ref=%E2%9C%93"), null);
});
