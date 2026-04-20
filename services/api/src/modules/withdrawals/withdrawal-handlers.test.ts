import assert from "node:assert/strict";
import test from "node:test";

import { assertRequestedStatus, assertValidWithdrawalRequest } from "./handlers";

test("reject invalid destination address", () => {
  assert.throws(
    () =>
      assertValidWithdrawalRequest({
        amountAtoms: 10n,
        destinationAddress: "not-an-address",
      }),
    /valid Base\/EVM address/,
  );
});

test("reject non-positive withdrawal amount", () => {
  assert.throws(
    () =>
      assertValidWithdrawalRequest({
        amountAtoms: 0n,
        destinationAddress: "0x1111111111111111111111111111111111111111",
      }),
    /greater than zero/,
  );
});

test("duplicate execute/fail blocked by status guard", () => {
  assert.throws(() => assertRequestedStatus("completed"), /not in requested state/);
  assert.throws(() => assertRequestedStatus("failed"), /not in requested state/);
  assert.doesNotThrow(() => assertRequestedStatus("requested"));
});
