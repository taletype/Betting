import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "../page";
import PolymarketPage from "../polymarket/page";
import AdminPolymarketPage from "../admin/polymarket/page";
import {
  getPolymarketReadinessChecklist,
  getPolymarketRoutingDisabledReasons,
  getPolymarketRoutingReadiness,
  getPolymarketTopBlockingReason,
  type PolymarketRoutingReadinessInput,
} from "./polymarket-routing-readiness";

const VALID_BUILDER_CODE = "0x1b9fbf91c927df5bfd14abf1b4c3d2ee000e5badee3f3ae170a36ebe5bd0d3ca";

const assertRedirectsTo = async (run: () => unknown | Promise<unknown>, location: string): Promise<void> => {
  await assert.rejects(
    async () => {
      await run();
    },
    (error: unknown) =>
      error instanceof Error &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.includes(`;${location};`),
  );
};

const withNodeEnv = async (value: string | undefined, run: () => Promise<void>): Promise<void> => {
  const originalEnv = process.env;
  process.env = { ...originalEnv };

  const mutableEnv = process.env as Record<string, string | undefined>;
  if (value === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = value;
  }

  try {
    await run();
  } finally {
    process.env = originalEnv;
  }
};

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

const makePolymarketRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "m-open",
  source: "polymarket",
  externalId: "POLY-OPEN",
  slug: "poly-open",
  title: "Open useful market",
  description: "Useful market",
  status: "open",
  marketUrl: "https://polymarket.com/event/poly-open",
  closeTime: null,
  endTime: null,
  resolvedAt: null,
  bestBid: 0.41,
  bestAsk: 0.44,
  lastTradePrice: 0.43,
  volume24h: 500,
  volumeTotal: 10000,
  liquidity: 10000,
  sourceProvenance: { stale: false, staleAfter: "2099-05-01T01:00:00.000Z" },
  lastSyncedAt: "2099-05-01T01:00:00.000Z",
  lastUpdatedAt: "2099-05-01T01:00:00.000Z",
  createdAt: "2026-05-01T01:00:00.000Z",
  updatedAt: "2099-05-01T01:00:00.000Z",
  outcomes: [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.41, bestAsk: 0.44, lastPrice: 0.43, volume: null }],
  recentTrades: [],
  latestOrderbook: [],
  ...overrides,
});

test("home page renders Chinese-first Polymarket landing page", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ ref: "hkref001" }) }));
  assert.match(markup, /用一個頁面追蹤熱門 Polymarket 市場/);
  assert.match(markup, /瀏覽市場、比較價格/);
  assert.match(markup, /你正在使用推薦碼：HKREF001/);
  assert.match(markup, /href="\/polymarket\?ref=HKREF001"/);
  assert.match(markup, /前往 Polymarket 市場/);
  assert.match(markup, /交易尚未啟用/);
  assert.match(markup, /複製邀請連結/);
  assert.match(markup, /本平台不會代用戶下注或交易/);
});

test("home page renders real trade-tick chart preview when synced ticks exist", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "m1",
          source: "polymarket",
          externalId: "POLY-HOME-1",
          slug: "poly-home-1",
          title: "Will launch QA keep chart data honest?",
          description: "Home chart smoke",
          status: "open",
          marketUrl: "https://polymarket.com/event/poly-home-1",
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
          outcomes: [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.41, bestAsk: 0.44, lastPrice: 0.43, volume: null }],
          recentTrades: [
            { externalTradeId: "t1", externalOutcomeId: "yes", side: "buy", price: 0.41, size: 10, tradedAt: "2026-05-01T01:00:00.000Z" },
            { externalTradeId: "t2", externalOutcomeId: "yes", side: "buy", price: 0.42, size: 11, tradedAt: "2026-05-01T01:05:00.000Z" },
            { externalTradeId: "t3", externalOutcomeId: "yes", side: "sell", price: 0.43, size: 12, tradedAt: "2026-05-01T01:10:00.000Z" },
          ],
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
  assert.match(markup, /Will launch QA keep chart data honest/);
  assert.match(markup, /<svg class="line-chart"/);
  assert.doesNotMatch(markup, /市場資料暫時未能更新/);
});

test("Polymarket page renders empty-state when no synced rows exist", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const calls: string[] = [];

  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;

  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
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
  assert.match(markup, /暫時未有活躍市場資料/);
  assert.match(markup, /查看全部市場/);
  assert.match(markup, /增值錢包 \/ Add funds/);
  assert.match(markup, /資金會進入你的錢包。本平台不會託管你的資金。/);
  assert.match(markup, /單純增值錢包不代表已完成 Polymarket 交易。/);
  assert.match(markup, /連接錢包 錢包已連接 更換錢包 斷開連接/);
  assert.doesNotMatch(markup, /已設定的 API 或同站 API route 無法連線/);
  assert.equal(calls[0], "http://127.0.0.1:3000/api/external/markets");
});

test("Polymarket default feed hides cancelled and zero-liquidity markets", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        makePolymarketRecord({ id: "cancelled", externalId: "POLY-CANCELLED", slug: "poly-cancelled", title: "Cancelled zero volume market", status: "cancelled", volume24h: 0, volumeTotal: 0, liquidity: 0 }),
        makePolymarketRecord({ id: "open", externalId: "POLY-ACTIVE", slug: "poly-active", title: "Active market should lead", volume24h: 50, liquidity: 200 }),
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /Active market should lead/);
  assert.doesNotMatch(markup, /Cancelled zero volume market/);
});

test("Polymarket cancelled filter shows cancelled markets with badge", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        makePolymarketRecord({ id: "open", title: "Open filter market" }),
        makePolymarketRecord({ id: "cancelled", externalId: "POLY-CANCELLED", slug: "poly-cancelled", title: "Cancelled filter market", status: "cancelled", volume24h: 0, volumeTotal: 0, liquidity: 0 }),
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage({ searchParams: Promise.resolve({ status: "cancelled" }) }));
  assert.match(markup, /Cancelled filter market/);
  assert.match(markup, /已取消/);
  assert.match(markup, /暫無成交資料/);
  assert.doesNotMatch(markup, /Open filter market/);
});

test("Polymarket all filter sorts open markets before cancelled and closed markets", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        makePolymarketRecord({ id: "cancelled", externalId: "POLY-CANCELLED", slug: "poly-cancelled", title: "Cancelled high-volume market", status: "cancelled", volume24h: 9999, liquidity: 9999 }),
        makePolymarketRecord({ id: "closed", externalId: "POLY-CLOSED", slug: "poly-closed", title: "Closed high-volume market", status: "closed", volume24h: 9000, liquidity: 9000 }),
        makePolymarketRecord({ id: "open", externalId: "POLY-OPEN-SORT", slug: "poly-open-sort", title: "Open lower-volume market", volume24h: 10, liquidity: 20 }),
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage({ searchParams: Promise.resolve({ status: "all" }) }));
  assert.ok(markup.indexOf("Open lower-volume market") < markup.indexOf("Cancelled high-volume market"));
  assert.ok(markup.indexOf("Open lower-volume market") < markup.indexOf("Closed high-volume market"));
});

test("Polymarket stale markets show stale badge when explicitly included", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        makePolymarketRecord({
          id: "stale",
          externalId: "POLY-STALE",
          slug: "poly-stale",
          title: "Stale market with cached prices",
          sourceProvenance: { stale: true, staleAfter: "2000-01-01T00:00:00.000Z" },
          lastSyncedAt: "2000-01-01T00:00:00.000Z",
          lastUpdatedAt: "2000-01-01T00:00:00.000Z",
          updatedAt: "2000-01-01T00:00:00.000Z",
        }),
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const defaultMarkup = renderToStaticMarkup(await PolymarketPage());
  assert.doesNotMatch(defaultMarkup, /Stale market with cached prices/);

  const allMarkup = renderToStaticMarkup(await PolymarketPage({ searchParams: Promise.resolve({ status: "all" }) }));
  assert.match(allMarkup, /Stale market with cached prices/);
  assert.match(allMarkup, /資料可能過期/);
});

test("Polymarket page browsing works without builder code and shows disabled trade CTA only when configured", async (t) => {
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
    const markup = renderToStaticMarkup(await PolymarketPage({ searchParams: Promise.resolve({ ref: "friend001" }) }));
    assert.match(markup, /Will Polymarket routing be scaffolded/);
    assert.match(markup, /你正在使用推薦碼：FRIEND001/);
    assert.match(markup, /href="\/polymarket\/poly-1\?ref=FRIEND001"/);
    assert.match(markup, /透過 Polymarket 交易/);
    assert.match(markup, /Builder Code 未設定/);
    assert.match(markup, /disabled=""/);
  });

  await withBuilderCode(VALID_BUILDER_CODE, async () => {
    const markup = renderToStaticMarkup(await PolymarketPage());
    assert.match(markup, /透過 Polymarket 交易/);
    assert.match(markup, /交易功能尚未啟用/);
    assert.match(markup, /title="交易功能尚未啟用"/);
    assert.doesNotMatch(markup, /你目前所在地區暫不支援 Polymarket 下單/);
    assert.match(markup, /disabled=""/);
  });
});

test("Polymarket detail page renders synced market detail", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "m1",
          source: "polymarket",
          externalId: "POLYDETAIL-1",
          slug: "poly-detail-1",
          title: "Will the detail page show a Polymarket market?",
          description: "Detail test",
          status: "open",
          marketUrl: "https://polymarket.com/event/poly-detail-1",
          closeTime: "2026-06-01T00:00:00.000Z",
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
          outcomes: [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.5, bestAsk: 0.52, lastPrice: 0.51, volume: null }],
          recentTrades: [{ externalTradeId: "t1", externalOutcomeId: "yes", side: "buy", price: 0.51, size: 10, tradedAt: "2026-05-01T01:05:00.000Z" }],
          latestOrderbook: [{ externalOutcomeId: "yes", bids: [], asks: [], capturedAt: "2026-05-01T01:05:00.000Z", lastTradePrice: 0.51, bestBid: 0.5, bestAsk: 0.52 }],
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "poly-detail-1" }),
    searchParams: Promise.resolve({ ref: "hkref001" }),
  }));
  assert.match(markup, /Will the detail page show a Polymarket market/);
  assert.match(markup, /你正在使用推薦碼：HKREF001/);
  assert.match(markup, /推薦分成/);
  assert.match(markup, /Orderbook snapshot/);
  assert.match(markup, /透過 Polymarket 交易/);
  assert.match(markup, /mobile-trade-sheet/);
  assert.match(markup, /<summary><span>透過 Polymarket 交易<\/span><small>交易功能尚未啟用<\/small><\/summary>/);
  assert.match(markup, /data-testid="readiness-checklist"/);
  assert.match(markup, /透過 Polymarket 交易 · 交易功能尚未啟用/);
  assert.match(markup, /複製市場推薦連結/);
});

test("Polymarket detail page renders safe not-found state", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/external/markets/polymarket/missing-market")) {
      return new Response(JSON.stringify({ market: null }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "missing-market" }),
    searchParams: Promise.resolve({ ref: "hkref001" }),
  }));

  assert.match(markup, /暫時未有市場資料/);
  assert.match(markup, /你正在使用推薦碼：HKREF001/);
  assert.match(markup, /href="\/polymarket\?ref=HKREF001"/);
});

test("cancelled Polymarket detail page renders safely with disabled trade CTA", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/orderbook")) {
      return new Response(JSON.stringify({ orderbook: [], depth: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/trades")) {
      return new Response(JSON.stringify({ trades: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/history")) {
      return new Response(JSON.stringify({ history: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/stats")) {
      return new Response(JSON.stringify({ source: "polymarket", externalId: "POLY-CANCELLED-DETAIL", volume24h: 0, liquidity: 0, spread: null, closeTime: null, lastUpdatedAt: "2099-05-01T01:00:00.000Z", stale: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        market: makePolymarketRecord({
          id: "cancelled-detail",
          externalId: "POLY-CANCELLED-DETAIL",
          slug: "poly-cancelled-detail",
          title: "Cancelled market detail remains browsable",
          status: "cancelled",
          volume24h: 0,
          volumeTotal: 0,
          liquidity: 0,
        }),
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "poly-cancelled-detail" }),
    searchParams: Promise.resolve({}),
  }));

  assert.match(markup, /Cancelled market detail remains browsable/);
  assert.match(markup, /已取消/);
  assert.match(markup, /此市場目前不可交易。/);
  assert.match(markup, /透過 Polymarket 交易/);
  assert.match(markup, /disabled=""/);
});

test("Polymarket detail page renders safe unavailable state when external fetch times out", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = process.env.API_REQUEST_TIMEOUT_MS;
  process.env.API_REQUEST_TIMEOUT_MS = "20";

  globalThis.fetch = ((input, init) => {
    const signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalTimeout === undefined) {
      delete process.env.API_REQUEST_TIMEOUT_MS;
    } else {
      process.env.API_REQUEST_TIMEOUT_MS = originalTimeout;
    }
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "will-the-philadelphia-76ers-win-the-2026-nba-finals" }),
    searchParams: Promise.resolve({ ref: "timeoutref" }),
  }));

  assert.match(markup, /市場資料暫時未能更新/);
  assert.match(markup, /外部 Polymarket \/ Gamma \/ CLOB 資料暫時不可用/);
  assert.match(markup, /你正在使用推薦碼：TIMEOUTREF/);
  assert.match(markup, /透過 Polymarket 交易/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /路由交易保持停用/);
});

test("Polymarket detail page renders chart panels and keeps trade shell disabled", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/history")) {
      return new Response(
        JSON.stringify({
          history: [
            { timestamp: "2026-05-01T01:00:00.000Z", outcome: "yes", price: 0.4, volume: 10, liquidity: 100, source: "polymarket" },
            { timestamp: "2026-05-01T01:05:00.000Z", outcome: "yes", price: 0.42, volume: 12, liquidity: 110, source: "polymarket" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/stats")) {
      return new Response(
        JSON.stringify({ source: "polymarket", externalId: "POLYCHART-1", volume24h: 500, liquidity: 110, spread: 0.03, closeTime: null, lastUpdatedAt: "2026-05-01T01:05:00.000Z", stale: false }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/orderbook")) {
      return new Response(
        JSON.stringify({
          orderbook: [{ externalOutcomeId: "yes", bids: [], asks: [], capturedAt: "2026-05-01T01:05:00.000Z", lastTradePrice: 0.42, bestBid: 0.4, bestAsk: 0.43 }],
          depth: [
            { side: "bid", price: 0.4, size: 10, cumulativeSize: 10 },
            { side: "ask", price: 0.43, size: 8, cumulativeSize: 8 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.endsWith("/trades")) {
      return new Response(
        JSON.stringify({ trades: [{ externalTradeId: "t1", externalOutcomeId: "yes", side: "buy", price: 0.42, size: 12, tradedAt: "2026-05-01T01:05:00.000Z" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        market: {
          id: "m1",
          source: "polymarket",
          externalId: "POLYCHART-1",
          slug: "poly-chart-1",
          title: "Will detail charts render?",
          description: "Chart smoke",
          status: "open",
          marketUrl: "https://polymarket.com/event/poly-chart-1",
          closeTime: null,
          endTime: null,
          resolvedAt: null,
          bestBid: 0.4,
          bestAsk: 0.43,
          lastTradePrice: 0.42,
          volume24h: 500,
          volumeTotal: 10000,
          lastSyncedAt: "2026-05-01T01:00:00.000Z",
          createdAt: "2026-05-01T01:00:00.000Z",
          updatedAt: "2026-05-01T01:00:00.000Z",
          outcomes: [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.4, bestAsk: 0.43, lastPrice: 0.42, volume: null }],
          recentTrades: [],
          latestOrderbook: [],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "poly-chart-1" }),
    searchParams: Promise.resolve({ ref: "friendcode" }),
  }));
  assert.match(markup, /Will detail charts render/);
  assert.match(markup, /價格走勢/);
  assert.match(markup, /成交量/);
  assert.match(markup, /流動性/);
  assert.match(markup, /訂單簿深度/);
  assert.match(markup, /近期成交/);
  assert.match(markup, /<svg class="line-chart"/);
  assert.match(markup, /disabled=""/);
  assert.match(markup, /實際訂單提交<\/span><span class="kv-value">已停用/);
  assert.match(markup, /你正在使用推薦碼：FRIENDCODE/);
});

test("Polymarket detail browsing works without POLY_BUILDER_CODE", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        market: {
          id: "m1",
          source: "polymarket",
          externalId: "POLY-NO-BUILDER",
          slug: "poly-no-builder",
          title: "Will browsing work without builder code?",
          description: "Builder code safety",
          status: "open",
          marketUrl: "https://polymarket.com/event/poly-no-builder",
          closeTime: null,
          endTime: null,
          resolvedAt: null,
          bestBid: 0.4,
          bestAsk: 0.43,
          lastTradePrice: 0.42,
          volume24h: 500,
          volumeTotal: 10000,
          lastSyncedAt: "2026-05-01T01:00:00.000Z",
          createdAt: "2026-05-01T01:00:00.000Z",
          updatedAt: "2026-05-01T01:00:00.000Z",
          outcomes: [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.4, bestAsk: 0.43, lastPrice: 0.42, volume: null }],
          recentTrades: [],
          latestOrderbook: [],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withBuilderCode(null, async () => {
    const { default: DetailPage } = await import("../polymarket/[slug]/page");
    const markup = renderToStaticMarkup(await DetailPage({
      params: Promise.resolve({ slug: "poly-no-builder" }),
      searchParams: Promise.resolve({}),
    }));

    assert.match(markup, /Will browsing work without builder code/);
    assert.match(markup, /Builder Code 未設定/);
    assert.match(markup, /透過 Polymarket 交易/);
    assert.match(markup, /disabled=""/);
  });
});

test("admin Polymarket page requires an admin session", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assertRedirectsTo(() => AdminPolymarketPage(), "/login");
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
  assert.match(markup, /市場資料暫時未能更新/);
  assert.match(markup, /已設定的 API 或同站 API route 無法連線/);
  assert.doesNotMatch(markup, /後端尚未提供 \/external\/markets/);
  assert.doesNotMatch(markup, /暫時未有市場資料/);
});

test("Polymarket page separates source failure from safe empty state", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: "MARKET_SOURCE_UNAVAILABLE",
        source: "external_markets,gamma-api.polymarket.com/events",
        message: "internal details must not render",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /市場資料暫時未能更新/);
  assert.match(markup, /已設定的市場資料來源暫時無法連線。/);
  assert.match(markup, /請稍後再試；瀏覽市場不需要登入或連接錢包。/);
  assert.match(markup, /external_markets, gamma-api\.polymarket\.com\/events/);
  assert.doesNotMatch(markup, /internal details must not render/);
  assert.doesNotMatch(markup, /暫時未有市場資料/);
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
  assert.doesNotMatch(markup, /暫時未有市場資料/);
});

test("Polymarket referral code survives navigation into market detail", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "m1",
          source: "polymarket",
          externalId: "POLYREF-1",
          slug: "polyref-1",
          title: "Will referral state survive?",
          description: "Referral test",
          status: "open",
          marketUrl: "https://polymarket.com/event/polyref-1",
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
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage({
    searchParams: Promise.resolve({ ref: "hkref001" }),
  }));
  assert.match(markup, /你正在使用推薦碼：HKREF001/);
  assert.match(markup, /href="\/polymarket\/polyref-1\?ref=HKREF001"/);
});

test("Polymarket page uses same-site route instead of configured service API base", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const calls: string[] = [];

  process.env.API_BASE_URL = "https://api.example.com";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.VERCEL_URL = "bet.example.vercel.app";

  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);

    if (url === "https://api.example.com/external/markets") {
      throw new Error("connect ECONNREFUSED api.example.com:443");
    }

    return new Response(
      JSON.stringify([
        {
          id: "fallback-1",
          source: "polymarket",
          externalId: "POLY-FALLBACK-1",
          slug: "poly-fallback-1",
          title: "Fallback Polymarket",
          description: "Same-site fallback row",
          status: "open",
          marketUrl: "https://polymarket.com/event/poly-fallback-1",
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
      { status: 200, headers: { "content-type": "application/json" } },
    );
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
    if (originalVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalVercelUrl;
    }
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.doesNotMatch(markup, /市場資料暫時未能更新/);
  assert.doesNotMatch(markup, /已設定的 API 或同站 API route 無法連線/);
  assert.match(markup, /Fallback Polymarket/);
  assert.equal(calls[0], "https://bet.example.vercel.app/api/external/markets");
  assert.equal(calls.length, 1);
});

test("Polymarket page does not call configured API when service lacks external markets endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const calls: string[] = [];

  process.env.API_BASE_URL = "https://api.example.com";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.VERCEL_URL = "bet.example.vercel.app";

  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);

    if (url === "https://api.example.com/external/markets") {
      return new Response(JSON.stringify({ error: "Endpoint not implemented" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify([
        {
          id: "fallback-404-1",
          source: "polymarket",
          externalId: "POLY-FALLBACK-404",
          slug: "poly-fallback-404",
          title: "Fallback after missing backend endpoint",
          description: "Same-site route should recover",
          status: "open",
          marketUrl: "https://polymarket.com/event/poly-fallback-404",
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
      { status: 200, headers: { "content-type": "application/json" } },
    );
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
    if (originalVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalVercelUrl;
    }
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /Fallback after missing backend endpoint/);
  assert.match(markup, /API base URL configured<\/span><span class="kv-value">yes/);
  assert.match(markup, /same-origin API reachable<\/span><span class="kv-value">yes/);
  assert.match(markup, /external markets endpoint reachable<\/span><span class="kv-value">yes/);
  assert.match(markup, /Polymarket fallback enabled<\/span><span class="kv-value">yes/);
  assert.match(markup, /交易狀態<\/span><span class="kv-value">交易介面預覽；實盤提交停用/);
  assert.doesNotMatch(markup, /市場資料暫時未能更新/);
  assert.deepEqual(calls, ["https://bet.example.vercel.app/api/external/markets"]);
});

test("Polymarket page treats a web-origin public API base as same-origin mode", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const calls: string[] = [];

  delete process.env.API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = "https://betting-web-ten.vercel.app";
  process.env.NEXT_PUBLIC_SITE_URL = "https://betting-web-ten.vercel.app";

  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
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
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /資料 URL<\/span><span class="kv-value mono">https:\/\/betting-web-ten\.vercel\.app\/api\/external\/markets/);
  assert.doesNotMatch(markup, /https:\/\/betting-web-ten\.vercel\.app\/external\/markets/);
  assert.deepEqual(calls, ["https://betting-web-ten.vercel.app/api/external/markets"]);
});

test("Polymarket page renders operator-visible diagnostics when production API base is missing and fallback fails", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalVercelUrl = process.env.VERCEL_URL;
  const calls: string[] = [];

  delete process.env.API_BASE_URL;
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.VERCEL_URL = "bet.example.vercel.app";

  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({ error: "Supabase environment variables are missing or invalid", code: "SUPABASE_ENV_MISSING" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
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
    if (originalVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = originalVercelUrl;
    }
  });

  await withNodeEnv("production", async () => {
    const markup = renderToStaticMarkup(await PolymarketPage());
    assert.match(markup, /市場資料暫時未能更新/);
    assert.match(markup, /API_BASE_URL \/ NEXT_PUBLIC_API_BASE_URL 未設定/);
    assert.match(markup, /\/api\/external\/markets fallback/);
    assert.match(markup, /後端 \/external\/markets 返回 500/);
    assert.match(markup, /Supabase 環境變數缺失或無效/);
  });

  assert.equal(calls[0], "https://bet.example.vercel.app/api/external/markets");
});

test("Polymarket page ignores localhost service API base for public market browsing", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;
  const originalPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const originalWarn = console.warn;
  const originalError = console.error;
  const calls: string[] = [];

  process.env.API_BASE_URL = "http://localhost:4000";
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  console.warn = () => {};
  console.error = () => {};

  t.after(() => {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
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

  await withNodeEnv("production", async () => {
    const markup = renderToStaticMarkup(await PolymarketPage());
    assert.doesNotMatch(markup, /市場資料暫時未能更新/);
    assert.match(markup, /資料 URL<\/span><span class="kv-value mono">http:\/\/127\.0\.0\.1:3000\/api\/external\/markets/);
    assert.doesNotMatch(markup, /localhost:4000/);
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0], "http://127.0.0.1:3000/api/external/markets");
});

test("Polymarket page defaults routed trading disabled", async () => {
  const originalFetch = globalThis.fetch;
  const original = process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  try {
    const markup = renderToStaticMarkup(await PolymarketPage());
    assert.match(markup, /交易狀態<\/span><span class="kv-value">交易介面預覽；實盤提交停用/);
  } finally {
    globalThis.fetch = originalFetch;
    if (original === undefined) delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED; else process.env.POLYMARKET_ROUTED_TRADING_ENABLED = original;
  }
});

test("Polymarket readiness keeps feature disabled as top launch reason while checklist stays complete", () => {
  const input: PolymarketRoutingReadinessInput = {
    loggedIn: true,
    hasBuilderCode: true,
    featureEnabled: false,
    walletConnected: false,
    geoblockAllowed: true,
    hasCredentials: false,
    userSigningAvailable: false,
    marketTradable: true,
    orderValid: true,
    submitterAvailable: true,
    userSigned: false,
  };

  assert.equal(getPolymarketRoutingReadiness(input), "feature_disabled");
  assert.equal(getPolymarketTopBlockingReason(input), "feature_disabled");
  assert.deepEqual(getPolymarketRoutingDisabledReasons(input).slice(0, 4), [
    "feature_disabled",
    "wallet_not_connected",
    "credentials_missing",
    "signature_required",
  ]);

  const checklist = getPolymarketReadinessChecklist(input);
  assert.deepEqual(checklist.map((item) => item.id), [
    "login",
    "wallet",
    "funding",
    "region",
    "credentials",
    "signature",
    "builder_code",
    "trading_feature",
    "market_status",
    "order_values",
    "submitter",
  ]);
  assert.equal(checklist.find((item) => item.id === "wallet")?.status, "missing");
  assert.equal(checklist.find((item) => item.id === "credentials")?.status, "missing");
  assert.equal(checklist.find((item) => item.id === "signature")?.status, "missing");
});

test("Polymarket page keeps routed trade CTA disabled when submitter is unavailable", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalFlag = process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
  const originalSubmitter = process.env.POLYMARKET_SUBMITTER_AVAILABLE;

  process.env.POLYMARKET_ROUTED_TRADING_ENABLED = "true";
  delete process.env.POLYMARKET_SUBMITTER_AVAILABLE;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "m1",
          source: "polymarket",
          externalId: "POLY-CTA-1",
          slug: "poly-cta-1",
          title: "Will routed trading stay disabled without a submitter?",
          description: "Submitter safety test",
          status: "open",
          marketUrl: "https://polymarket.com/event/poly-cta-1",
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
          outcomes: [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.5, bestAsk: 0.52, lastPrice: 0.51, volume: null }],
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
    if (originalFlag === undefined) {
      delete process.env.POLYMARKET_ROUTED_TRADING_ENABLED;
    } else {
      process.env.POLYMARKET_ROUTED_TRADING_ENABLED = originalFlag;
    }
    if (originalSubmitter === undefined) {
      delete process.env.POLYMARKET_SUBMITTER_AVAILABLE;
    } else {
      process.env.POLYMARKET_SUBMITTER_AVAILABLE = originalSubmitter;
    }
  });

  await withBuilderCode(VALID_BUILDER_CODE, async () => {
    const markup = renderToStaticMarkup(await PolymarketPage());
    assert.match(markup, /交易狀態<\/span><span class="kv-value">交易介面預覽已啟用；實盤提交仍然停用/);
    assert.match(markup, /透過 Polymarket 交易/);
    assert.match(markup, /尚未登入/);
    assert.match(markup, /disabled=""/);
  });
});
