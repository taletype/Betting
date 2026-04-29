import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import PolymarketPage from "../polymarket/page";

const VALID_BUILDER_CODE = "0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca";

const withBuilderCode = async (value: string | null, run: () => Promise<void>): Promise<void> => {
  const previous = process.env.POLY_BUILDER_CODE;

  if (value === null) {
    delete process.env.POLY_BUILDER_CODE;
  } else {
    process.env.POLY_BUILDER_CODE = value;
  }

  try {
    await run();
  } finally {
    if (previous === undefined) {
      delete process.env.POLY_BUILDER_CODE;
    } else {
      process.env.POLY_BUILDER_CODE = previous;
    }
  }
};

test("Polymarket page renders empty-state when no synced rows exist", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /暫無已同步市場資料/);
  assert.match(markup, /pnpm sync:external/);
});

test("Polymarket page shows disabled trade CTA only when builder code is configured", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "m1",
          source: "polymarket",
          externalId: "POLY-1",
          slug: "poly-1",
          title: "Will Polymarket routing be scaffolded?",
          description: "Builder route test",
          status: "open",
          marketUrl: "https://polymarket.com/event/poly-1",
          closeTime: null,
          endTime: null,
          resolvedAt: null,
          bestBid: 0.5,
          bestAsk: 0.52,
          lastTradePrice: 0.51,
          volume24h: 10,
          volumeTotal: 100,
          lastSyncedAt: "2026-05-01T01:00:00.000Z",
          createdAt: "2026-05-01T01:00:00.000Z",
          updatedAt: "2026-05-01T01:00:00.000Z",
          outcomes: [],
          recentTrades: [],
        },
        {
          id: "m2",
          source: "kalshi",
          externalId: "KX-1",
          slug: "kx-1",
          title: "Will Kalshi stay native?",
          description: "CTA test",
          status: "open",
          marketUrl: "https://kalshi.com/markets/kx-1",
          closeTime: null,
          endTime: null,
          resolvedAt: null,
          bestBid: 0.4,
          bestAsk: 0.42,
          lastTradePrice: 0.41,
          volume24h: 10,
          volumeTotal: 100,
          lastSyncedAt: "2026-05-01T01:00:00.000Z",
          createdAt: "2026-05-01T01:00:00.000Z",
          updatedAt: "2026-05-01T01:00:00.000Z",
          outcomes: [],
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

  await withBuilderCode(null, async () => {
    const markup = renderToStaticMarkup(await PolymarketPage());
    assert.doesNotMatch(markup, /透過 Polymarket 交易/);
  });

  await withBuilderCode(VALID_BUILDER_CODE, async () => {
    const markup = renderToStaticMarkup(await PolymarketPage());
    assert.match(markup, /提交用戶自行簽署訂單/);
    assert.match(markup, /交易功能尚未啟用/);
    assert.match(markup, /disabled=""/);
  });
});

test("Polymarket page renders load error when market fetch fails", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:4000");
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /無法載入已同步市場資料/);
  assert.doesNotMatch(markup, /暫無已同步市場資料/);
});

test("Polymarket page renders synced rows when markets exist", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "m1",
          source: "polymarket",
          externalId: "POLYTEST-1",
          slug: "polytest-1",
          title: "Will CPI be above 3%?",
          description: "BLS CPI print",
          status: "open",
          marketUrl: "https://polymarket.com/event/polytest-1",
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
        {
          id: "m2",
          source: "kalshi",
          externalId: "KXTEST-1",
          slug: "kxtest-1",
          title: "Legacy non-Polymarket row",
          description: "Should not render in the v1 portal",
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
          outcomes: [],
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

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /Will CPI be above 3%/);
  assert.match(markup, /polymarket/);
  assert.doesNotMatch(markup, /Legacy non-Polymarket row/);
  assert.doesNotMatch(markup, /暫無已同步市場資料/);
});

test("Polymarket page renders load error when configured API base is unavailable", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const calls: string[] = [];

  process.env.API_BASE_URL = "https://api.example.com";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);

    throw new Error("connect ECONNREFUSED api.example.com:443");
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalApiBaseUrl === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = originalApiBaseUrl;
    }
    if (originalPublicApiBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_API_BASE_URL = originalPublicApiBaseUrl;
    }
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /無法載入已同步市場資料/);
  assert.equal(calls[0], "https://api.example.com/external/markets");
  assert.equal(calls.length, 1);
});


test("Polymarket page defaults routed trading disabled", async () => {
  const original = process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /路由交易已啟用<\/span><span class="kv-value">否/);
  if (original === undefined) delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED; else process.env.POLYMARKET_ROUTED_TRADING_ENABLED = original;
});
