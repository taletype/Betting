import assert from "node:assert/strict";
import test from "node:test";

import { BaseChainMonitor } from "./BaseChainMonitor";

const withMockedFetch = async (responses: unknown[], run: () => Promise<void>) => {
  const originalFetch = globalThis.fetch;
  let index = 0;

  globalThis.fetch = (async () => {
    const payload = responses[index++];
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test("returns pending when receipt exists but confirmations are low", async () => {
  await withMockedFetch(
    [
      { jsonrpc: "2.0", id: 1, result: { blockNumber: "0x10", status: "0x1" } },
      { jsonrpc: "2.0", id: 1, result: "0x11" },
    ],
    async () => {
      const monitor = new BaseChainMonitor("https://rpc.example");
      const result = await monitor.monitorTransaction({ txHash: "0xtx", minConfirmations: 3 });
      assert.equal(result.state, "pending");
    },
  );
});
