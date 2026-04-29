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
        latestOrderbook: [],
      },
    ],
    getExternalMarketRecord: async () => null,
    listExternalMarketTrades: async () => null,
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

test("GET /external/markets falls back to public Polymarket Gamma without authentication", async (t) => {
  const handleRequest = await getHandleRequest();
  const originalFetch = globalThis.fetch;

  setExternalMarketsRepositoryForTests({
    listExternalMarketRecords: async () => [],
    getExternalMarketRecord: async () => null,
    listExternalMarketTrades: async () => null,
  });

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "gamma-1",
          slug: "gamma-market",
          question: "Will standalone API expose Gamma data?",
          active: true,
          closed: false,
          outcomes: JSON.stringify(["Yes", "No"]),
          outcomePrices: JSON.stringify(["0.62", "0.38"]),
          clobTokenIds: JSON.stringify(["yes-token", "no-token"]),
          volume: "1000",
          volume24hr: "100",
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    setExternalMarketsRepositoryForTests(null);
  });

  const response = await handleRequest(new Request("http://localhost/external/markets"));
  const payload = (await response.json()) as Array<{ source: string; title: string; outcomes: Array<{ lastPrice: number | null }> }>;

  assert.equal(response.status, 200);
  assert.equal(payload[0]?.source, "polymarket");
  assert.equal(payload[0]?.title, "Will standalone API expose Gamma data?");
  assert.equal(payload[0]?.outcomes[0]?.lastPrice, 0.62);
});

test("GET /external/markets/:source/:id/orderbook returns latest snapshots", async (t) => {
  const handleRequest = await getHandleRequest();

  setExternalMarketsRepositoryForTests({
    listExternalMarketRecords: async () => [],
    getExternalMarketRecord: async () => ({
      id: "m1",
      source: "polymarket",
      externalId: "123",
      slug: "will-it-rain",
      title: "Will it rain?",
      description: "desc",
      status: "open",
      marketUrl: null,
      closeTime: null,
      endTime: null,
      resolvedAt: null,
      bestBid: null,
      bestAsk: null,
      lastTradePrice: null,
      volume24h: null,
      volumeTotal: null,
      lastSyncedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      outcomes: [],
      recentTrades: [],
      latestOrderbook: [{ externalOutcomeId: "yes", bids: [], asks: [], capturedAt: "2026-01-01T00:00:00.000Z", lastTradePrice: null, bestBid: null, bestAsk: null }],
    }),
    listExternalMarketTrades: async () => [],
  });

  t.after(() => {
    setExternalMarketsRepositoryForTests(null);
  });

  const response = await handleRequest(new Request("http://localhost/external/markets/polymarket/123/orderbook"));
  const payload = (await response.json()) as { orderbook: Array<{ externalOutcomeId: string }> };
  assert.equal(response.status, 200);
  assert.equal(payload.orderbook[0]?.externalOutcomeId, "yes");
});

test("GET /external/markets/:source/:id/trades returns imported external trades", async (t) => {
  const handleRequest = await getHandleRequest();

  setExternalMarketsRepositoryForTests({
    listExternalMarketRecords: async () => [],
    getExternalMarketRecord: async () => null,
    listExternalMarketTrades: async () => [
      {
        externalTradeId: "trade-1",
        externalOutcomeId: "yes",
        source: "polymarket",
        side: "buy",
        price: 0.43,
        pricePpm: "430000",
        size: 10,
        sizeAtoms: "10000000",
        executedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });

  t.after(() => {
    setExternalMarketsRepositoryForTests(null);
  });

  const response = await handleRequest(new Request("http://localhost/external/markets/polymarket/123/trades"));
  const payload = (await response.json()) as {
    source: string;
    externalId: string;
    trades: Array<{ externalTradeId: string; pricePpm: string }>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.source, "polymarket");
  assert.equal(payload.externalId, "123");
  assert.equal(payload.trades[0]?.externalTradeId, "trade-1");
  assert.equal(payload.trades[0]?.pricePpm, "430000");
});
