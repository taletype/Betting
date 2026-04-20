import assert from "node:assert/strict";
import test from "node:test";

import { Wallet, verifyMessage } from "ethers";

import { assertWalletLinkMessage } from "./handlers";

test("successful wallet link verification message + signature", async () => {
  const wallet = Wallet.createRandom();
  const userId = "00000000-0000-4000-8000-000000000001";
  const message = `Bet wallet link\nuser:${userId}\nnonce:test-nonce`;

  assert.doesNotThrow(() => assertWalletLinkMessage(message, userId));

  const signature = await wallet.signMessage(message);
  const recovered = verifyMessage(message, signature);

  assert.equal(recovered.toLowerCase(), wallet.address.toLowerCase());
});

test("wallet link verification rejects wrong user message", () => {
  assert.throws(
    () => assertWalletLinkMessage("Bet wallet link\nuser:wrong\nnonce:test", "00000000-0000-4000-8000-000000000001"),
    /user mismatch/,
  );
});
