import assert from "node:assert/strict";
import test from "node:test";

import { setExternalMarketsRepositoryForTests } from "./modules/external-markets/repository";

process.env.NODE_ENV = "test";

const getHandleRequest = async () => (await import("./server")).handleRequest;

test("GET /external/markets returns synced data", async (t) => {
  const handleRequest = await getHandleRequest();

  setExternalMarketsRepositoryForTests({
    listExternalMarketRecords: async () => [
      {
        id: "m1",
        source: "polymarket",
        externalId: "123",
        slug: "will-it-rain",
        title: "Will it rain?",
        description: "desc",
        status: "open",
        marketUrl: "https://polymarket.com/event/will-it-rain",
        closeTime: null,
        endTime: null,
        resolvedAt: null,
        bestBid: 0.42,
        bestAsk: 0.44,
        lastTradePrice: 0.43,
        volume24h: 100,
        volumeTotal: 1000,
        lastSyncedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        outcomes: [],
        recentTrades: [],
      },
    ],
    getExternalMarketRecord: async () => null,
  });

  t.after(() => {
    setExternalMarketsRepositoryForTests(null);
  });

  const response = await handleRequest(new Request("http://localhost/external/markets"));
  const payload = (await response.json()) as Array<{ externalId: string; source: string }>;

  assert.equal(response.status, 200);
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.externalId, "123");
  assert.equal(payload[0]?.source, "polymarket");
});
