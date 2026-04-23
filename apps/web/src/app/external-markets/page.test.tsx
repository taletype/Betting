import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ExternalMarketsPage from "./page";

test("Market Research page renders empty-state when no synced rows exist", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await ExternalMarketsPage());
  assert.match(markup, /No synced market data yet/);
  assert.match(markup, /pnpm sync:external/);
});

test("Market Research page renders load error when external market fetch fails", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:4000");
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await ExternalMarketsPage());
  assert.match(markup, /Unable to load synced market data/);
  assert.doesNotMatch(markup, /No synced market data yet/);
});

test("Market Research page renders synced rows when external markets exist", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "m1",
          source: "kalshi",
          externalId: "KXTEST-1",
          slug: "kxtest-1",
          title: "Will CPI be above 3%?",
          description: "BLS CPI print",
          status: "open",
          marketUrl: "https://kalshi.com/markets/kxtest-1",
          closeTime: null,
          endTime: null,
          resolvedAt: null,
          bestBid: 0.41,
          bestAsk: 0.44,
          lastTradePrice: 0.43,
          volume24h: 500,
          volumeTotal: 10000,
          lastSyncedAt: "2026-05-01T01:00:00.000Z",
          createdAt: "2026-05-01T01:00:00.000Z",
          updatedAt: "2026-05-01T01:00:00.000Z",
          outcomes: [
            {
              externalOutcomeId: "yes",
              title: "Yes",
              slug: "yes",
              index: 0,
              yesNo: "yes",
              bestBid: 0.41,
              bestAsk: 0.44,
              lastPrice: 0.43,
              volume: null,
            },
          ],
          recentTrades: [],
        },
      ]),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await ExternalMarketsPage());
  assert.match(markup, /Will CPI be above 3%/);
  assert.match(markup, /kalshi/);
  assert.doesNotMatch(markup, /No synced market data yet/);
});
