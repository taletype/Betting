import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "./server";

const withEnv = async (vars: Record<string, string | undefined>, run: () => Promise<void>) => {
  const prior = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(vars)) {
    prior.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await run();
  } finally {
    for (const [key, value] of prior) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test("rejects order placement when global kill switch is enabled", async () => {
  await withEnv({ OP_DISABLE_ORDER_PLACEMENT: "true", OP_DISABLED_ORDER_MARKET_IDS: undefined }, async () => {
    const response = await handleRequest(
      new Request("http://localhost/orders", {
        method: "POST",
        body: JSON.stringify({
          marketId: "11111111-1111-1111-1111-111111111111",
          outcomeId: "22222222-2222-2222-2222-222222222222",
          side: "buy",
          orderType: "limit",
          price: "100",
          quantity: "5",
        }),
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "order placement is temporarily disabled" });
  });
});

test("rejects order placement for a halted market", async () => {
  await withEnv(
    {
      OP_DISABLE_ORDER_PLACEMENT: "false",
      OP_DISABLED_ORDER_MARKET_IDS: "11111111-1111-1111-1111-111111111111",
    },
    async () => {
      const response = await handleRequest(
        new Request("http://localhost/orders", {
          method: "POST",
          body: JSON.stringify({
            marketId: "11111111-1111-1111-1111-111111111111",
            outcomeId: "22222222-2222-2222-2222-222222222222",
            side: "buy",
            orderType: "limit",
            price: "100",
            quantity: "5",
          }),
        }),
      );

      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        error: "order placement is temporarily disabled for this market",
      });
    },
  );
});

test("rejects withdrawal requests when kill switch is enabled", async () => {
  await withEnv({ OP_DISABLE_WITHDRAWAL_REQUEST: "true" }, async () => {
    const response = await handleRequest(
      new Request("http://localhost/withdrawals", {
        method: "POST",
        body: JSON.stringify({
          amountAtoms: "1000",
          destinationAddress: "0x0000000000000000000000000000000000000001",
        }),
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "withdrawal requests are temporarily disabled",
    });
  });
});

test("rejects deposit verification when kill switch is enabled", async () => {
  await withEnv({ OP_DISABLE_DEPOSIT_VERIFY: "true" }, async () => {
    const response = await handleRequest(
      new Request("http://localhost/deposits/verify", {
        method: "POST",
        body: JSON.stringify({ txHash: "0xabc" }),
      }),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: "deposit verification is temporarily disabled",
    });
  });
});
