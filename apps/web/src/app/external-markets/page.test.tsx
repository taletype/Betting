import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import HomePage from "../page";
import PolymarketPage from "../polymarket/page";
import AdminPolymarketPage from "../admin/polymarket/page";
import { PolymarketTradeTicket } from "./polymarket-trade-ticket";
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
  imageUrl: null,
  iconUrl: null,
  imageSourceUrl: null,
  imageUpdatedAt: null,
  closeTime: null,
  endTime: null,
  resolvedAt: null,
  bestBid: 0.41,
  bestAsk: 0.44,
  lastTradePrice: 0.43,
  volume24h: 500,
  volumeTotal: 10000,
  liquidity: 10000,
  sourceProvenance: {
    stale: false,
    staleAfter: "2099-05-01T01:00:00.000Z",
    statusFlags: { active: true, closed: false, acceptingOrders: true, enableOrderBook: true },
  },
  lastSyncedAt: "2099-05-01T01:00:00.000Z",
  lastUpdatedAt: "2099-05-01T01:00:00.000Z",
  createdAt: "2026-05-01T01:00:00.000Z",
  updatedAt: "2099-05-01T01:00:00.000Z",
  outcomes: [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.41, bestAsk: 0.44, lastPrice: 0.43, volume: null }],
  recentTrades: [],
  latestOrderbook: [],
  ...overrides,
});

const makePolymarketDetailFetch = (marketOverrides: Record<string, unknown> = {}): typeof globalThis.fetch => {
  const market = makePolymarketRecord({
    externalId: "POLYDETAIL-IMAGE",
    slug: "poly-detail-image",
    title: "Will the detail page show market imagery?",
    description: "Detail image test",
    closeTime: "2099-06-01T00:00:00.000Z",
    outcomes: [
      { externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.5, bestAsk: 0.52, lastPrice: 0.51, volume: null },
      { externalOutcomeId: "no", title: "No", slug: "no", index: 1, yesNo: "no", bestBid: 0.48, bestAsk: 0.5, lastPrice: 0.49, volume: null },
    ],
    ...marketOverrides,
  });

  return (async (input) => {
    const url = String(input);
    if (url.endsWith("/orderbook")) {
      return new Response(JSON.stringify({ orderbook: market.latestOrderbook ?? [], depth: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/trades")) {
      return new Response(JSON.stringify({ trades: market.recentTrades ?? [], recentTrades: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/history")) {
      return new Response(JSON.stringify({ history: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/stats")) {
      return new Response(
        JSON.stringify({
          source: "polymarket",
          externalId: market.externalId,
          volume24h: market.volume24h,
          liquidity: market.liquidity,
          spread: 0.02,
          closeTime: market.closeTime,
          lastUpdatedAt: "2099-05-01T01:00:00.000Z",
          stale: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/external/markets/polymarket/")) {
      return new Response(JSON.stringify({ market }), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify([market]), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
};

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
  assert.match(markup, /瀏覽市場、比較價格，並在交易功能啟用後透過 Polymarket 自行簽署交易。/);
  assert.match(markup, /你正在使用推薦碼：HKREF001/);
  assert.match(markup, /登入或註冊後，如推薦碼有效，系統會保存你的推薦來源。/);
  assert.match(markup, /href="\/polymarket\?ref=HKREF001"/);
  assert.match(markup, /href="\/ambassador"/);
  assert.match(markup, /查看熱門市場/);
  assert.match(markup, /邀請朋友/);
  assert.match(markup, /交易尚未啟用/);
  assert.match(markup, /複製邀請連結/);
  assert.match(markup, /本平台不會代用戶下注或交易/);
  assert.match(markup, /暫時未有符合條件的開放市場/);
  assert.doesNotMatch(markup, /前往 Polymarket|Open on Polymarket/);
  assert.doesNotMatch(markup, /下線|downline|guaranteed profit|保證獲利/);
});

test("Polymarket public pages only call and link read-only external market routes", () => {
  const publicPageSources = [
    "src/app/page.tsx",
    "src/app/polymarket/page.tsx",
    "src/app/polymarket/[slug]/page.tsx",
    "src/app/[locale]/polymarket/page.tsx",
    "src/app/[locale]/polymarket/[slug]/page.tsx",
    "src/lib/api.ts",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

  assert.match(publicPageSources, /\/external\/markets/);
  assert.doesNotMatch(publicPageSources, /href=\{?[`"']\/(?:orders|markets|portfolio|claims|deposits|withdrawals)\b/);
  assert.doesNotMatch(publicPageSources, /getLocalApiUrl\(["'`](?:\/orders|\/markets|\/portfolio|\/claims|\/deposits|\/withdrawals)\b/);
  assert.doesNotMatch(publicPageSources, /fetch\([^)]*["'`](?:\/api)?\/(?:orders|markets|portfolio|claims|deposits|withdrawals)\b/);
  assert.doesNotMatch(publicPageSources, /rpc_place_order|rpc_request_withdrawal|rpc_verify_deposit|rpc_get_portfolio_snapshot|ledger_entries|ledger_journals/);
  assert.doesNotMatch(publicPageSources, /前往 Polymarket|Open on Polymarket/);
});

test("home page renders market cards with safe image behavior", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        makePolymarketRecord({
          id: "with-image",
          externalId: "POLY-IMAGE",
          slug: "poly-image",
          title: "Image market",
          imageUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/home-image.png",
          iconUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/home-icon.png",
          imageSourceUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/home-image.png",
          imageUpdatedAt: "2026-05-01T01:00:00.000Z",
          closeTime: "2099-06-01T00:00:00.000Z",
          outcomes: [
            { externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.41, bestAsk: 0.44, lastPrice: 0.43, volume: null },
            { externalOutcomeId: "no", title: "No", slug: "no", index: 1, yesNo: "no", bestBid: 0.56, bestAsk: 0.59, lastPrice: 0.57, volume: null },
          ],
        }),
        makePolymarketRecord({
          id: "with-icon",
          externalId: "POLY-ICON",
          slug: "poly-icon",
          title: "Icon market",
          imageUrl: null,
          iconUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/home-icon-only.png",
          volume24h: 400,
        }),
        makePolymarketRecord({
          id: "without-image",
          externalId: "POLY-NO-IMAGE",
          slug: "poly-no-image",
          title: "No image market",
          imageUrl: null,
          iconUrl: null,
          volume24h: 300,
        }),
        makePolymarketRecord({
          id: "invalid-image",
          externalId: "POLY-BAD-IMAGE",
          slug: "poly-bad-image",
          title: "Bad image market",
          imageUrl: "javascript:alert(1)",
          iconUrl: "data:image/png;base64,aaa",
          volume24h: 200,
        }),
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({ ref: "friend001" }) }));
  assert.match(markup, /home-image\.png/);
  assert.match(markup, /alt="Image market"/);
  assert.match(markup, /home-icon-only\.png/);
  assert.match(markup, /No image market/);
  assert.match(markup, /Polymarket/);
  assert.doesNotMatch(markup, /javascript:alert/);
  assert.doesNotMatch(markup, /data:image/);
  assert.match(markup, /成交量/);
  assert.match(markup, /流動性/);
  assert.match(markup, /收市時間/);
  assert.match(markup, /來源/);
  assert.match(markup, /最後更新/);
  assert.match(markup, /查看市場/);
  assert.match(markup, /href="\/polymarket\/poly-image\?ref=FRIEND001"/);
  assert.doesNotMatch(markup, /前往 Polymarket|Open on Polymarket/);
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

test("home page localizes World Cup markets and hides empty compact chart placeholders", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        makePolymarketRecord({
          id: "morocco",
          externalId: "POLY-MOROCCO",
          slug: "will-morocco-win-2026-world-cup",
          title: "Will Morocco win the 2026 FIFA World Cup?",
          outcomes: [
            { externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.11, bestAsk: 0.12, lastPrice: 0.11, volume: null },
            { externalOutcomeId: "no", title: "No", slug: "no", index: 1, yesNo: "no", bestBid: 0.88, bestAsk: 0.89, lastPrice: 0.89, volume: null },
          ],
          recentTrades: [],
        }),
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
  assert.match(markup, /摩洛哥會否贏得 2026 FIFA 世界盃？/);
  assert.match(markup, /是/);
  assert.match(markup, /否/);
  assert.doesNotMatch(markup, /暫時未有圖表資料/);
  assert.doesNotMatch(markup, /chart-empty/);
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
  assert.match(markup, /增值錢包/);
  assert.match(markup, /資金會進入你的錢包。本平台不會託管你的資金。/);
  assert.match(markup, /單純增值錢包不代表已完成 Polymarket 交易。/);
  assert.match(markup, /連接錢包 錢包已連接 更換錢包 斷開連接/);
  assert.doesNotMatch(markup, /前往 Polymarket/);
  assert.doesNotMatch(markup, /Open on Polymarket/);
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

test("Polymarket page renders Smart Feed and All Markets view controls", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify([makePolymarketRecord()]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const smartMarkup = renderToStaticMarkup(await PolymarketPage());
  assert.match(smartMarkup, /熱門市場/);
  assert.match(smartMarkup, /全部市場/);
  assert.match(smartMarkup, /正在查看：熱門市場/);

  const allMarkup = renderToStaticMarkup(await PolymarketPage({ searchParams: Promise.resolve({ view: "all" }) }));
  assert.match(allMarkup, /正在查看：全部市場/);
});

test("Polymarket all-market view renders low-quality stale browse-only markets", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        makePolymarketRecord({ id: "active", title: "Active all-view market" }),
        makePolymarketRecord({
          id: "no-price",
          externalId: "POLY-NO-PRICE",
          slug: "poly-no-price",
          title: "No price all-view market",
          bestBid: null,
          bestAsk: null,
          lastTradePrice: null,
          volume24h: 0,
          volumeTotal: 0,
          liquidity: 0,
          outcomes: [],
        }),
        makePolymarketRecord({
          id: "stale",
          externalId: "POLY-STALE-ALL",
          slug: "poly-stale-all",
          title: "Stale all-view market",
          sourceProvenance: { stale: true, staleAfter: "2000-01-01T00:00:00.000Z" },
          lastUpdatedAt: "2000-01-01T00:00:00.000Z",
          updatedAt: "2000-01-01T00:00:00.000Z",
        }),
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const smartMarkup = renderToStaticMarkup(await PolymarketPage());
  assert.match(smartMarkup, /Active all-view market/);
  assert.doesNotMatch(smartMarkup, /No price all-view market/);
  assert.doesNotMatch(smartMarkup, /Stale all-view market/);

  const allMarkup = renderToStaticMarkup(await PolymarketPage({ searchParams: Promise.resolve({ view: "all" }) }));
  assert.match(allMarkup, /No price all-view market/);
  assert.match(allMarkup, /Stale all-view market/);
  assert.match(allMarkup, /市場只供瀏覽/);
  assert.match(allMarkup, /暫無價格/);
  assert.match(allMarkup, /資料可能過期/);
  assert.match(allMarkup, /低成交量/);
});

test("Polymarket all-market pagination and filter links preserve referral code", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        ok: true,
        source: "supabase_cache",
        fallbackUsed: false,
        stale: false,
        lastUpdatedAt: "2099-05-01T01:00:00.000Z",
        markets: [makePolymarketRecord({ id: "page", title: "CPI paginated market" })],
        pagination: {
          limit: 10,
          offset: 0,
          nextOffset: 10,
          returnedCount: 1,
          totalCount: 25,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage({
    searchParams: Promise.resolve({ view: "all", status: "all", q: "cpi", sort: "volume", ref: "hkref001", limit: "10" }),
  }));

  assert.match(markup, /CPI paginated market/);
  assert.match(markup, /共 25 個已同步市場/);
  assert.match(markup, /載入更多/);
  assert.match(markup, /ref=HKREF001/);
  assert.match(markup, /href="\/polymarket\?q=cpi&amp;status=all&amp;view=all&amp;sort=volume&amp;ref=HKREF001&amp;limit=10&amp;offset=10"/);
  assert.match(markup, /href="\/polymarket\?q=cpi&amp;status=open&amp;view=all&amp;sort=volume&amp;ref=HKREF001&amp;limit=10"/);
});

test("market feed renders image when image_url is present", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        makePolymarketRecord({
          id: "with-image",
          externalId: "POLY-IMAGE",
          slug: "poly-image",
          title: "Image market",
          imageUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/feed-image.png",
          imageSourceUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/feed-image.png",
          imageUpdatedAt: "2026-05-01T01:00:00.000Z",
        }),
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /feed-image\.png/);
  assert.match(markup, /alt=\"Image market\"/);
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
          sourceProvenance: { stale: false, staleAfter: "2099-05-01T01:00:00.000Z", statusFlags: { active: true, closed: false, acceptingOrders: true, enableOrderBook: true } },
          lastSyncedAt: "2026-05-01T01:00:00.000Z",
          lastUpdatedAt: "2099-05-01T01:00:00.000Z",
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
          sourceProvenance: {
            statusFlags: { active: true, closed: false, acceptingOrders: true, enableOrderBook: true },
            staleAfter: "2099-01-01T00:00:00.000Z",
          },
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
    assert.match(markup, /href="\/polymarket\/poly-1\?source=polymarket&amp;externalId=POLY-1&amp;ref=FRIEND001"/);
    assert.match(markup, /連接錢包/);
    assert.match(markup, /Builder Code 未設定/);
    assert.match(markup, /來源：Polymarket/);
    assert.match(markup, /資料來源：Polymarket API/);
    assert.doesNotMatch(markup, /前往 Polymarket|Open on Polymarket/);
    assert.match(markup, /disabled=""/);
  });

  await withBuilderCode(VALID_BUILDER_CODE, async () => {
    const markup = renderToStaticMarkup(await PolymarketPage());
    assert.match(markup, /連接錢包/);
    assert.match(markup, /交易介面預覽/);
    assert.match(markup, /登入以保存推薦獎勵/);
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
          imageUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/detail-image.png",
          iconUrl: null,
          imageSourceUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/detail-image.png",
          imageUpdatedAt: "2026-05-01T01:00:00.000Z",
          closeTime: "2026-06-01T00:00:00.000Z",
          endTime: null,
          resolvedAt: null,
          bestBid: 0.5,
          bestAsk: 0.52,
          lastTradePrice: 0.51,
          volume24h: 10,
          volumeTotal: 100,
          sourceProvenance: {
            statusFlags: { active: true, closed: false, acceptingOrders: true, enableOrderBook: true },
            staleAfter: "2099-01-01T00:00:00.000Z",
          },
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
  assert.match(markup, /detail-image\.png/);
  assert.match(markup, /原始市場問題：/);
  assert.match(markup, /你正在使用推薦碼：HKREF001/);
  assert.match(markup, /推薦分成/);
  assert.match(markup, /Orderbook snapshot/);
  assert.match(markup, /建立用戶自行簽署訂單/);
  assert.match(markup, /來源：Polymarket/);
  assert.match(markup, /資料來源：Polymarket API/);
  assert.match(markup, /上次同步/);
  assert.doesNotMatch(markup, /前往 Polymarket|Open on Polymarket/);
  assert.match(markup, /mobile-trade-sheet/);
  assert.match(markup, /<summary><span>連接錢包<\/span><small>連接錢包<\/small><\/summary>/);
  assert.match(markup, /data-testid="readiness-checklist"/);
  assert.match(markup, /<button[^>]*>連接錢包<\/button>/);
  assert.match(markup, /複製市場推薦連結/);
  assert.equal(markup.match(/class="warning-card"/g)?.length ?? 0, 2);
});

test("Polymarket detail page renders hero image from image_url", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makePolymarketDetailFetch({
    imageUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/detail-hero.png",
    iconUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/detail-icon.png",
    imageSourceUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/detail-hero.png",
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "poly-detail-image" }),
    searchParams: Promise.resolve({ ref: "hkref001" }),
  }));

  assert.match(markup, /detail-hero\.png/);
  assert.match(markup, /alt="Will the detail page show market imagery\?"/);
  assert.match(markup, /loading="eager"/);
  assert.match(markup, /來源：Polymarket/);
  assert.match(markup, /最後更新/);
  assert.match(markup, /data-copy-value="http:\/\/127\.0\.0\.1:3000\/polymarket\/poly-detail-image\?ref=HKREF001"/);
  assert.match(markup, /複製市場連結/);
  assert.match(markup, /複製市場推薦連結/);
});

test("Polymarket detail treats live order flags as open even when end date is old", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makePolymarketDetailFetch({
    slug: "poly-live-old-date",
    externalId: "POLY-LIVE-OLD-DATE",
    title: "Live market with old date",
    closeTime: "2024-01-01T00:00:00.000Z",
    endTime: "2024-01-01T00:00:00.000Z",
    sourceProvenance: {
      stale: false,
      staleAfter: "2099-05-01T01:00:00.000Z",
      statusFlags: {
        active: true,
        closed: false,
        acceptingOrders: true,
        enableOrderBook: true,
        endDate: "2024-01-01T00:00:00.000Z",
      },
    },
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "poly-live-old-date" }),
    searchParams: Promise.resolve({}),
  }));

  assert.match(markup, /Live market with old date/);
  assert.match(markup, /可交易/);
  assert.match(markup, /連接錢包/);
  assert.doesNotMatch(markup, /市場已關閉/);
});

test("Polymarket detail shows precise orderbook disabled state", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makePolymarketDetailFetch({
    slug: "poly-orderbook-disabled",
    externalId: "POLY-ORDERBOOK-DISABLED",
    title: "Orderbook disabled market",
    sourceProvenance: {
      stale: false,
      staleAfter: "2099-05-01T01:00:00.000Z",
      statusFlags: {
        active: true,
        closed: false,
        enableOrderBook: false,
      },
    },
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "poly-orderbook-disabled" }),
    searchParams: Promise.resolve({}),
  }));

  assert.match(markup, /Orderbook disabled market/);
  assert.match(markup, /訂單簿暫不可用/);
  assert.doesNotMatch(markup, /市場已關閉/);
});

test("Polymarket detail page falls back to icon_url when image_url is missing", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makePolymarketDetailFetch({
    imageUrl: null,
    iconUrl: "https://polymarket-upload.s3.us-east-2.amazonaws.com/detail-icon.png",
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "poly-detail-image" }),
    searchParams: Promise.resolve({}),
  }));

  assert.match(markup, /detail-icon\.png/);
  assert.doesNotMatch(markup, /market-hero-image-fallback/);
});

test("Polymarket detail page renders safe fallback for missing or unsafe image fields", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makePolymarketDetailFetch({
    imageUrl: "javascript:alert(1)",
    iconUrl: "not a url",
    imageSourceUrl: "javascript:alert(1)",
  });

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const unsafeMarkup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "poly-detail-image" }),
    searchParams: Promise.resolve({}),
  }));

  assert.match(unsafeMarkup, /market-hero-image-fallback/);
  assert.doesNotMatch(unsafeMarkup, /javascript:alert|not a url/);

  globalThis.fetch = makePolymarketDetailFetch({ imageUrl: null, iconUrl: null, imageSourceUrl: null });
  const missingMarkup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "poly-detail-image" }),
    searchParams: Promise.resolve({}),
  }));

  assert.match(missingMarkup, /market-hero-image-fallback/);
  assert.match(missingMarkup, /暫時未有訂單簿資料/);
  assert.match(missingMarkup, /暫時未有近期成交資料/);
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

test("Polymarket detail page resolves feed fallback links from market list", async (t) => {
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
      return new Response(JSON.stringify({ source: "polymarket", externalId: "POLY-NORWAY", volume24h: 500, liquidity: 10000, spread: 0.03, closeTime: null, lastUpdatedAt: "2099-05-01T01:00:00.000Z", stale: false }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/external/markets/polymarket/will-norway-win-the-2026-fifa-world-cup-893")) {
      return new Response(JSON.stringify({ market: null }), { status: 404, headers: { "content-type": "application/json" } });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        source: "polymarket_gamma_fallback",
        fallbackUsed: true,
        stale: false,
        lastUpdatedAt: "2099-05-01T01:00:00.000Z",
        markets: [
          makePolymarketRecord({
            id: "norway",
            externalId: "POLY-NORWAY",
            slug: "will-norway-win-the-2026-fifa-world-cup-893",
            title: "Will Norway win the 2026 FIFA World Cup?",
            outcomes: [
              { externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.11, bestAsk: 0.12, lastPrice: 0.11, volume: null },
              { externalOutcomeId: "no", title: "No", slug: "no", index: 1, yesNo: "no", bestBid: 0.88, bestAsk: 0.89, lastPrice: 0.89, volume: null },
            ],
          }),
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "will-norway-win-the-2026-fifa-world-cup-893" }),
    searchParams: Promise.resolve({}),
  }));

  assert.match(markup, /挪威會否贏得 2026 FIFA 世界盃？/);
  assert.match(markup, /POLY-NORWAY/);
  assert.match(markup, /複製市場連結/);
  assert.match(markup, /複製市場推薦連結/);
  assert.doesNotMatch(markup, /暫時未有市場資料/);
  assert.match(markup, /disabled=""/);
});

test("Polymarket detail page renders Norway Gamma fallback and preserves suffixed referral link", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/orderbook")) {
      return new Response(JSON.stringify({ orderbook: [], depth: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/trades")) {
      return new Response(JSON.stringify({ trades: [], recentTrades: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/history")) {
      return new Response(JSON.stringify({ history: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/stats")) {
      return new Response(JSON.stringify({ source: "polymarket", externalId: "558403", volume24h: 100, liquidity: 1000, spread: 0.03, closeTime: "2099-07-19T00:00:00.000Z", lastUpdatedAt: "2099-05-01T01:00:00.000Z", stale: false }), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(
      JSON.stringify({
        market: makePolymarketRecord({
          id: "polymarket:558403",
          externalId: "558403",
          slug: "will-norway-win-the-2026-fifa-world-cup",
          title: "Will Norway win the 2026 FIFA World Cup?",
          description: "Norway outright winner market",
          marketUrl: "https://polymarket.com/event/will-norway-win-the-2026-fifa-world-cup",
          closeTime: "2099-07-19T00:00:00.000Z",
          sourceProvenance: {
            source: "polymarket",
            upstream: "gamma-api.polymarket.com",
            endpoint: "/markets/slug/will-norway-win-the-2026-fifa-world-cup",
            fetchedVia: "public-gamma-detail-fallback",
            stale: false,
            statusFlags: { active: true, closed: false, archived: false, restricted: false },
          },
          outcomes: [
            { externalOutcomeId: "yes-token", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.11, bestAsk: 0.12, lastPrice: 0.11, volume: null },
            { externalOutcomeId: "no-token", title: "No", slug: "no", index: 1, yesNo: "no", bestBid: 0.88, bestAsk: 0.89, lastPrice: 0.89, volume: null },
          ],
        }),
        diagnostics: { gammaFallbackUsed: true },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "will-norway-win-the-2026-fifa-world-cup-893" }),
    searchParams: Promise.resolve({ ref: "hkref001" }),
  }));

  assert.match(markup, /挪威會否贏得 2026 FIFA 世界盃？/);
  assert.match(markup, /558403/);
  assert.doesNotMatch(markup, /gamma-api\.polymarket\.com \/markets\/slug\/will-norway-win-the-2026-fifa-world-cup/);
  assert.doesNotMatch(markup, /原始 route slug<\/span><span class="kv-value mono">will-norway-win-the-2026-fifa-world-cup-893/);
  assert.doesNotMatch(markup, /Gamma canonical slug<\/span><span class="kv-value mono">will-norway-win-the-2026-fifa-world-cup/);
  assert.match(markup, /data-copy-value="http:\/\/127\.0\.0\.1:3000\/polymarket\/will-norway-win-the-2026-fifa-world-cup-893\?ref=HKREF001"/);
  assert.match(markup, /你正在使用推薦碼：HKREF001/);
  assert.doesNotMatch(markup, /市場資料健康狀態/);
  assert.doesNotMatch(markup, /暫時未有市場資料/);
  assert.match(markup, /disabled=""/);
});

test("restricted Polymarket detail renders data but disables trading", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/orderbook")) return new Response(JSON.stringify({ orderbook: [], depth: [] }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.endsWith("/trades")) return new Response(JSON.stringify({ trades: [], recentTrades: [] }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.endsWith("/history")) return new Response(JSON.stringify({ history: [] }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.endsWith("/stats")) return new Response(JSON.stringify({ source: "polymarket", externalId: "POLY-RESTRICTED", volume24h: 100, liquidity: 1000, spread: 0.03, closeTime: null, lastUpdatedAt: "2099-05-01T01:00:00.000Z", stale: false }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(
      JSON.stringify({
        market: makePolymarketRecord({
          id: "restricted",
          externalId: "POLY-RESTRICTED",
          slug: "poly-restricted",
          title: "Restricted market still renders",
          sourceProvenance: { statusFlags: { active: true, closed: false, archived: false, restricted: true }, stale: false },
          outcomes: [{ externalOutcomeId: "yes-token", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.4, bestAsk: 0.43, lastPrice: 0.42, volume: null }],
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
    params: Promise.resolve({ slug: "poly-restricted" }),
    searchParams: Promise.resolve({}),
  }));

  assert.match(markup, /Restricted market still renders/);
  assert.match(markup, /市場暫不可交易/);
  assert.match(markup, /Polymarket reports this market as restricted/);
  assert.match(markup, /市場受限制/);
  assert.doesNotMatch(markup, /active \/ closed \/ archived \/ cancelled \/ accepting orders \/ order book \/ restricted<\/span><span class="kv-value">是 \/ 否 \/ 否 \/ 未知 \/ 未知 \/ 未知 \/ 是/);
  assert.doesNotMatch(markup, /暫時未有市場資料/);
  assert.match(markup, /disabled=""/);
});

test("Polymarket detail page uses source externalId query when feed provides it", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
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
      return new Response(JSON.stringify({ source: "polymarket", externalId: "POLY-QUERY-ID", volume24h: 500, liquidity: 10000, spread: 0.03, closeTime: null, lastUpdatedAt: "2099-05-01T01:00:00.000Z", stale: false }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/external/markets/polymarket/POLY-QUERY-ID")) {
      return new Response(JSON.stringify({ market: makePolymarketRecord({ externalId: "POLY-QUERY-ID", slug: "different-feed-slug", title: "Will query external id resolve?" }) }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ market: null }), { status: 404, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const { default: DetailPage } = await import("../polymarket/[slug]/page");
  const markup = renderToStaticMarkup(await DetailPage({
    params: Promise.resolve({ slug: "feed-slug-that-moved" }),
    searchParams: Promise.resolve({ source: "polymarket", externalId: "POLY-QUERY-ID" }),
  }));

  assert.match(markup, /Will query external id resolve/);
  assert.match(calls.join(" "), /POLY-QUERY-ID/);
});

test("Polymarket detail page shows localized primary title and original source question", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/history")) {
      return new Response(JSON.stringify({ history: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/stats")) {
      return new Response(JSON.stringify({ source: "polymarket", externalId: "POLY-SENEGAL", volume24h: 500, liquidity: 110, spread: 0.03, closeTime: null, lastUpdatedAt: "2026-05-01T01:05:00.000Z", stale: false }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/orderbook")) {
      return new Response(JSON.stringify({ orderbook: [], depth: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/trades")) {
      return new Response(JSON.stringify({ trades: [] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(
      JSON.stringify({
        market: makePolymarketRecord({
          id: "senegal",
          externalId: "POLY-SENEGAL",
          slug: "will-senegal-win-2026-world-cup",
          title: "Will Senegal win the 2026 FIFA World Cup?",
          outcomes: [
            { externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.11, bestAsk: 0.12, lastPrice: 0.11, volume: null },
            { externalOutcomeId: "no", title: "No", slug: "no", index: 1, yesNo: "no", bestBid: 0.88, bestAsk: 0.89, lastPrice: 0.89, volume: null },
          ],
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
    params: Promise.resolve({ slug: "will-senegal-win-2026-world-cup" }),
    searchParams: Promise.resolve({}),
  }));

  assert.match(markup, /塞內加爾會否贏得 2026 FIFA 世界盃？/);
  assert.match(markup, /原始市場問題：/);
  assert.match(markup, /Will Senegal win the 2026 FIFA World Cup\?/);
  assert.match(markup, /<strong>是<\/strong>/);
  assert.match(markup, /<strong>否<\/strong>/);
  assert.match(markup, /暫時未有價格歷史。市場資料會在同步後顯示。/);
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
  assert.match(markup, /市場已取消/);
  assert.doesNotMatch(markup, /<button[^>]*>透過 Polymarket 交易<\/button>/);
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

  assert.match(markup, /市場資料暫時不可用/);
  assert.match(markup, /外部 Polymarket \/ Gamma \/ CLOB 資料暫時不可用/);
  assert.match(markup, /你正在使用推薦碼：TIMEOUTREF/);
  assert.match(markup, /建立用戶自行簽署訂單/);
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
  assert.match(markup, /買賣盤深度/);
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
    assert.match(markup, /連接錢包/);
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
  assert.match(markup, /市場資料暫時不可用/);
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
  assert.match(markup, /市場資料暫時不可用/);
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
  assert.match(markup, />是<\/span>/);
  assert.match(markup, /polymarket/);
  assert.doesNotMatch(markup, /Legacy non-Polymarket row/);
  assert.doesNotMatch(markup, /暫時未有市場資料/);
});

test("Polymarket diagnostics reports fallback usage from API envelope", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        ok: true,
        source: "polymarket_gamma_fallback",
        fallbackUsed: true,
        stale: false,
        lastUpdatedAt: "2099-05-01T01:00:00.000Z",
        markets: [
          makePolymarketRecord({
            id: "fallback-row",
            externalId: "POLY-FALLBACK-DIAG",
            slug: "poly-fallback-diag",
            title: "Will diagnostics reflect fallback?",
          }),
        ],
        diagnostics: { fallbackUsedLastRequest: true },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /Will diagnostics reflect fallback/);
  assert.match(markup, /fallback used on last request<\/span><span class="kv-value">yes/);
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
  assert.match(markup, /href="\/polymarket\/polyref-1\?source=polymarket&amp;externalId=POLYREF-1&amp;ref=HKREF001"/);
});

test("Polymarket feed localizes safe World Cup titles and outcomes", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        makePolymarketRecord({
          id: "norway",
          externalId: "POLY-NORWAY",
          slug: "will-norway-win-2026-world-cup",
          title: "Will Norway win the 2026 FIFA World Cup?",
          outcomes: [
            { externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.11, bestAsk: 0.12, lastPrice: 0.11, volume: null },
            { externalOutcomeId: "no", title: "No", slug: "no", index: 1, yesNo: "no", bestBid: 0.88, bestAsk: 0.89, lastPrice: 0.89, volume: null },
          ],
          recentTrades: [],
        }),
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const markup = renderToStaticMarkup(await PolymarketPage());
  assert.match(markup, /挪威會否贏得 2026 FIFA 世界盃？/);
  assert.match(markup, />是<\/span>/);
  assert.match(markup, />否<\/span>/);
  assert.doesNotMatch(markup, /暫時未有圖表資料/);
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
    assert.match(markup, /市場資料暫時不可用/);
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

test("Polymarket readiness prioritizes user blockers while preserving launch checklist details", () => {
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

  assert.equal(getPolymarketRoutingReadiness(input), "wallet_not_connected");
  assert.equal(getPolymarketTopBlockingReason(input), "wallet_not_connected");
  assert.deepEqual(getPolymarketRoutingDisabledReasons(input).slice(0, 4), [
    "wallet_not_connected",
    "credentials_missing",
    "signature_required",
    "feature_disabled",
  ]);

  const checklist = getPolymarketReadinessChecklist(input);
  assert.deepEqual(checklist.map((item) => item.id), [
    "wallet",
    "funding",
    "credentials",
    "signature",
    "builder_code",
    "trading_feature",
    "market_status",
    "order_values",
    "submitter",
  ]);
  assert.equal(checklist.find((item) => item.id === "wallet")?.status, "missing");
  assert.equal(checklist.find((item) => item.id === "funding")?.status, "missing");
  assert.equal(checklist.find((item) => item.id === "credentials")?.status, "missing");
  assert.equal(checklist.find((item) => item.id === "signature")?.status, "missing");
});

test("Polymarket trade ticket renders action-first non-login states", () => {
  const baseProps = {
    locale: "zh-HK" as const,
    marketTitle: "Will Senegal win the 2026 FIFA World Cup?",
    outcomes: [{ tokenId: "yes", title: "Yes", bestAsk: 0.12 }],
    tokenId: "yes",
    outcome: "Yes",
    side: "buy" as const,
    price: 0.12,
    size: 10,
    loggedIn: false,
    hasBuilderCode: true,
    featureEnabled: true,
    betaUserAllowlisted: true,
    submitModeEnabled: true,
    walletConnected: false,
    walletFundsSufficient: true,
    hasCredentials: false,
    userSigningAvailable: false,
    marketTradable: true,
    orderValid: true,
    submitterAvailable: true,
    userSigned: false,
  };

  const noWallet = renderToStaticMarkup(<PolymarketTradeTicket {...baseProps} />);
  assert.match(noWallet, /連接錢包/);
  assert.match(noWallet, /登入以保存推薦獎勵/);
  assert.doesNotMatch(noWallet, /前往 Polymarket|受阻/);

  const missingCredentials = renderToStaticMarkup(<PolymarketTradeTicket {...baseProps} walletConnected hasCredentials={false} />);
  assert.match(missingCredentials, /設定 Polymarket 交易權限/);

  const restrictedMarket = renderToStaticMarkup(<PolymarketTradeTicket {...baseProps} walletConnected hasCredentials marketTradable={false} marketTradabilityLabel="訂單簿暫不可用" marketTradabilityReason="Polymarket order book is disabled for this market." />);
  assert.match(restrictedMarket, /訂單簿暫不可用/);
  assert.match(restrictedMarket, /Polymarket order book is disabled for this market/);
  assert.doesNotMatch(restrictedMarket, /實際交易是否可提交|合規檢查判斷/);

  const disabledSubmitter = renderToStaticMarkup(<PolymarketTradeTicket {...baseProps} walletConnected hasCredentials submitModeEnabled={false} />);
  assert.match(disabledSubmitter, /實盤提交已停用/);
  assert.match(disabledSubmitter, /目前只提供市場瀏覽及訂單預覽/);
  assert.match(disabledSubmitter, /Builder Code[\s\S]*完成/);
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
    assert.match(markup, /連接錢包/);
    assert.match(markup, /disabled=""/);
  });
});
