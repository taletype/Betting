import assert from "node:assert/strict";
import test from "node:test";

import { createPolymarketAdapter } from "./polymarket";

test("polymarket adapter normalizes API market payload and retains provenance", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.startsWith("https://gamma-api.polymarket.com/markets")) {
      return new Response(
        JSON.stringify([
          {
            id: "123",
            conditionId: "0xcondition",
            slug: "will-it-rain",
            question: "Will it rain?",
            description: "Rain in SF",
            active: true,
            closed: false,
            outcomes: '["Yes","No"]',
            outcomePrices: '["0.43","0.57"]',
            clobTokenIds: '["yes-token","no-token"]',
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.startsWith("https://data-api.polymarket.com/trades")) {
      return new Response(
        JSON.stringify([
          {
            side: "BUY",
            asset: "yes-token",
            conditionId: "0xcondition",
            size: 12.5,
            price: 0.44,
            timestamp: 1_763_568_000,
            outcome: "Yes",
            outcomeIndex: 0,
            transactionHash: "0xtrade-1",
          },
          {
            side: "SELL",
            asset: "no-token",
            conditionId: "0xcondition",
            size: "6.25",
            price: "0.56",
            timestamp: 1_763_567_000,
            outcome: "No",
            outcomeIndex: 1,
            transactionHash: "0xtrade-2",
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
  assert.equal(markets[0]?.outcomes[0]?.externalOutcomeId, "yes-token");
  assert.equal(markets[0]?.recentTrades.length, 2);
  assert.equal(markets[0]?.lastTradePrice, 0.44);
  assert.equal(markets[0]?.outcomes[0]?.lastPrice, 0.44);
  const raw = markets[0]?.rawPayload as { provenance?: { upstream?: string } };
  assert.equal(raw.provenance?.upstream, "gamma-api.polymarket.com");
});

test("polymarket adapter skips malformed trade rows and preserves market sync", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.startsWith("https://gamma-api.polymarket.com/markets")) {
      return new Response(
        JSON.stringify([
          {
            id: "123",
            conditionId: "0xcondition",
            slug: "will-it-rain",
            question: "Will it rain?",
            outcomes: '["Yes","No"]',
            clobTokenIds: '["yes-token","no-token"]',
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.startsWith("https://data-api.polymarket.com/trades")) {
      return new Response(
        JSON.stringify([
          {
            side: "BUY",
            asset: "yes-token",
            conditionId: "0xcondition",
            size: 5,
            price: 0.49,
            timestamp: 1_763_568_000,
            transactionHash: "0xtrade-1",
          },
          {
            side: "BUY",
            asset: "yes-token",
            conditionId: "0xcondition",
            price: "oops",
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

  const [market] = await createPolymarketAdapter().listMarkets();
  assert.equal(market?.recentTrades.length, 1);
  assert.equal(market?.recentTrades[0]?.price, 0.49);
});

test("polymarket adapter tolerates malformed trade payloads", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.startsWith("https://gamma-api.polymarket.com/markets")) {
      return new Response(
        JSON.stringify([
          {
            id: "123",
            conditionId: "0xcondition",
            slug: "will-it-rain",
            question: "Will it rain?",
            outcomes: '["Yes","No"]',
            clobTokenIds: '["yes-token","no-token"]',
            outcomePrices: '["0.49","0.51"]',
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.startsWith("https://data-api.polymarket.com/trades")) {
      return new Response(JSON.stringify({ error: "bad payload" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const [market] = await createPolymarketAdapter().listMarkets();
  assert.equal(market?.recentTrades.length, 0);
  assert.equal(market?.lastTradePrice, null);
});
