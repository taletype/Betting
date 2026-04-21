import assert from "node:assert/strict";
import test from "node:test";

import { createPolymarketAdapter } from "./polymarket";

test("polymarket adapter normalizes API market payload", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.startsWith("https://gamma-api.polymarket.com/markets")) {
      return new Response(
        JSON.stringify([
          {
            id: "123",
            conditionId: "0xabc123",
            slug: "will-it-rain",
            question: "Will it rain?",
            description: "Rain in SF",
            active: true,
            closed: false,
            endDate: "2026-06-01T00:00:00Z",
            bestBid: "0.42",
            bestAsk: "0.44",
            lastTradePrice: "0.43",
            volume24hr: "1200",
            volume: "5000",
            outcomes: "[\"Yes\",\"No\"]",
            outcomePrices: "[\"0.43\",\"0.57\"]",
            clobTokenIds: "[\"yes-token\",\"no-token\"]",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.startsWith("https://data-api.polymarket.com/trades")) {
      return new Response(
        JSON.stringify([
          {
            conditionId: "0xabc123",
            side: "BUY",
            size: 10,
            price: 0.43,
            timestamp: 1767225600,
            outcome: "Yes",
            outcomeIndex: 0,
            transactionHash: "0xtrade123",
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markets = await createPolymarketAdapter().listMarkets();

  assert.equal(markets.length, 1);
  assert.equal(markets[0]?.source, "polymarket");
  assert.equal(markets[0]?.externalId, "123");
  assert.equal(markets[0]?.outcomes.length, 2);
  assert.equal(markets[0]?.outcomes[0]?.externalOutcomeId, "yes-token");
  assert.equal(markets[0]?.outcomes[0]?.yesNo, "yes");
  assert.equal(markets[0]?.recentTrades[0]?.tradeId, "0xtrade123");
  assert.equal(markets[0]?.recentTrades[0]?.outcomeExternalId, "yes-token");
});
