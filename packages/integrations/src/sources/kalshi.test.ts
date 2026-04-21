import assert from "node:assert/strict";
import test from "node:test";

import { createKalshiAdapter } from "./kalshi";

test("kalshi adapter normalizes API market payload", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.startsWith("https://api.elections.kalshi.com/trade-api/v2/markets?")) {
      return new Response(
        JSON.stringify({
          markets: [
            {
              ticker: "KXTEST-1",
              title: "Will CPI be above 3%?",
              subtitle: "BLS CPI print",
              status: "open",
              close_time: "2026-05-01T00:00:00Z",
              latest_expiration_time: "2026-05-02T00:00:00Z",
              yes_bid_dollars: "0.41",
              yes_ask_dollars: "0.44",
              no_bid_dollars: "0.56",
              no_ask_dollars: "0.59",
              last_price_dollars: "0.43",
              volume_fp: "10000",
              volume_24h_fp: "500",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.startsWith("https://api.elections.kalshi.com/trade-api/v2/markets/trades")) {
      return new Response(
        JSON.stringify({
          trades: [
            {
              trade_id: "kalshi-trade-1",
              ticker: "KXTEST-1",
              count_fp: "10.00",
              yes_price_dollars: "0.43",
              no_price_dollars: "0.57",
              taker_side: "yes",
              created_time: "2026-05-01T01:00:00Z",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markets = await createKalshiAdapter().listMarkets();

  assert.equal(markets.length, 1);
  assert.equal(markets[0]?.source, "kalshi");
  assert.equal(markets[0]?.externalId, "KXTEST-1");
  assert.equal(markets[0]?.outcomes.length, 2);
  assert.equal(markets[0]?.outcomes[0]?.title, "Yes");
  assert.equal(markets[0]?.recentTrades[0]?.tradeId, "kalshi-trade-1");
  assert.equal(markets[0]?.recentTrades[0]?.price, 0.43);
});
