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

    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markets = await createPolymarketAdapter().listMarkets();

  assert.equal(markets.length, 1);
  assert.equal(markets[0]?.source, "polymarket");
  assert.equal(markets[0]?.outcomes[0]?.externalOutcomeId, "yes-token");
  const raw = markets[0]?.rawPayload as { provenance?: { upstream?: string } };
  assert.equal(raw.provenance?.upstream, "gamma-api.polymarket.com");
});
