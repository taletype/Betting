import assert from "node:assert/strict";
import test from "node:test";
import { normalizeApiPayload } from "./api-serialization";

test("normalizeApiPayload stringifies bigint fields and normalizes dates to ISO strings", () => {
  const payload = normalizeApiPayload({
    balances: [{ available: 100n, reserved: 0n }],
    linkedWallet: { verifiedAt: new Date("2026-01-03T00:00:00.000Z") },
    nested: [{ matchedAt: "2026-01-04T00:00:00.000Z", sequence: 5n }],
  }) as {
    balances: Array<{ available: string; reserved: string }>;
    linkedWallet: { verifiedAt: string };
    nested: Array<{ matchedAt: string; sequence: string }>;
  };

  assert.equal(payload.balances[0]?.available, "100");
  assert.equal(payload.balances[0]?.reserved, "0");
  assert.equal(payload.linkedWallet.verifiedAt, "2026-01-03T00:00:00.000Z");
  assert.equal(payload.nested[0]?.matchedAt, "2026-01-04T00:00:00.000Z");
  assert.equal(payload.nested[0]?.sequence, "5");
  assert.doesNotThrow(() => JSON.stringify(payload));
});
