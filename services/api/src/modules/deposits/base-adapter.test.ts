import assert from "node:assert/strict";
import test from "node:test";

import { BaseChainAdapter } from "@bet/chain";

const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55aeb5f8a5f5";

const padAddressTopic = (address: string): string =>
  `0x${"0".repeat(24)}${address.replace("0x", "").toLowerCase()}`;

const amountToData = (value: bigint): string => `0x${value.toString(16).padStart(64, "0")}`;

const mkReceipt = (input: {
  token: string;
  from: string;
  to: string;
  amount: bigint;
  status?: string;
}) => ({
  transactionHash: "0xtx",
  blockNumber: "0x10",
  status: input.status ?? "0x1",
  logs: [
    {
      address: input.token,
      topics: [transferTopic, padAddressTopic(input.from), padAddressTopic(input.to)],
      data: amountToData(input.amount),
      logIndex: "0x1",
    },
  ],
});

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

test("successful deposit verification", async () => {
  await withMockedFetch(
    [
      { jsonrpc: "2.0", id: 1, result: mkReceipt({ token: "0xusdc", from: "0xaaa", to: "0xbbb", amount: 25n }) },
      { jsonrpc: "2.0", id: 1, result: "0x20" },
    ],
    async () => {
      const adapter = new BaseChainAdapter("https://rpc.example");
      const result = await adapter.verifyUsdcTransfer({
        txHash: "0xtx",
        tokenAddress: "0xusdc",
        expectedFrom: "0xaaa",
        expectedTo: "0xbbb",
        minConfirmations: 2,
      });

      assert.equal(result.status, "confirmed");
      assert.equal(result.transfer?.amount, 25n);
    },
  );
});

test("rejects wrong token", async () => {
  await withMockedFetch(
    [
      { jsonrpc: "2.0", id: 1, result: mkReceipt({ token: "0xnotusdc", from: "0xaaa", to: "0xbbb", amount: 25n }) },
      { jsonrpc: "2.0", id: 1, result: "0x20" },
    ],
    async () => {
      const adapter = new BaseChainAdapter("https://rpc.example");
      const result = await adapter.verifyUsdcTransfer({
        txHash: "0xtx",
        tokenAddress: "0xusdc",
        expectedFrom: "0xaaa",
        expectedTo: "0xbbb",
        minConfirmations: 1,
      });

      assert.equal(result.status, "wrong_token");
    },
  );
});

test("rejects wrong recipient", async () => {
  await withMockedFetch(
    [
      { jsonrpc: "2.0", id: 1, result: mkReceipt({ token: "0xusdc", from: "0xaaa", to: "0xccc", amount: 25n }) },
      { jsonrpc: "2.0", id: 1, result: "0x20" },
    ],
    async () => {
      const adapter = new BaseChainAdapter("https://rpc.example");
      const result = await adapter.verifyUsdcTransfer({
        txHash: "0xtx",
        tokenAddress: "0xusdc",
        expectedFrom: "0xaaa",
        expectedTo: "0xbbb",
        minConfirmations: 1,
      });

      assert.equal(result.status, "wrong_recipient");
    },
  );
});

test("rejects wrong sender", async () => {
  await withMockedFetch(
    [
      { jsonrpc: "2.0", id: 1, result: mkReceipt({ token: "0xusdc", from: "0xccc", to: "0xbbb", amount: 25n }) },
      { jsonrpc: "2.0", id: 1, result: "0x20" },
    ],
    async () => {
      const adapter = new BaseChainAdapter("https://rpc.example");
      const result = await adapter.verifyUsdcTransfer({
        txHash: "0xtx",
        tokenAddress: "0xusdc",
        expectedFrom: "0xaaa",
        expectedTo: "0xbbb",
        minConfirmations: 1,
      });

      assert.equal(result.status, "wrong_sender");
    },
  );
});
