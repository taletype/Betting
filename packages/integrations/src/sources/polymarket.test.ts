import assert from "node:assert/strict";
import test from "node:test";

import { createPolymarketAdapter } from "./polymarket";

test("polymarket adapter normalizes API market payload", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "123",
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
          tokens: [
            { token_id: "yes", outcome: "Yes", bestBid: "0.42", bestAsk: "0.44", price: "0.43" },
            { token_id: "no", outcome: "No", bestBid: "0.58", bestAsk: "0.60", price: "0.57" },
          ],
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markets = await createPolymarketAdapter().listMarkets();

  assert.equal(markets.length, 1);
  assert.equal(markets[0]?.source, "polymarket");
  assert.equal(markets[0]?.externalId, "123");
  assert.equal(markets[0]?.outcomes.length, 2);
  assert.equal(markets[0]?.outcomes[0]?.yesNo, "yes");
  assert.equal(markets[0]?.recentTrades.length > 0, true);
});
