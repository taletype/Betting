import assert from "node:assert/strict";
import test from "node:test";

import { createKalshiAdapter } from "./kalshi";

test("kalshi adapter normalizes API market payload", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        markets: [
          {
            ticker: "KXTEST-1",
            title: "Will CPI be above 3%?",
            subtitle: "BLS CPI print",
            status: "open",
            close_time: "2026-05-01T00:00:00Z",
            expiration_time: "2026-05-02T00:00:00Z",
            yes_bid: "41",
            yes_ask: "44",
            no_bid: "56",
            no_ask: "59",
            last_price: "43",
            volume: "10000",
            volume_24h: "500",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markets = await createKalshiAdapter().listMarkets();

  assert.equal(markets.length, 1);
  assert.equal(markets[0]?.source, "kalshi");
  assert.equal(markets[0]?.externalId, "KXTEST-1");
  assert.equal(markets[0]?.outcomes.length, 2);
  assert.equal(markets[0]?.outcomes[0]?.title, "Yes");
  assert.equal(markets[0]?.recentTrades.length, 1);
});
