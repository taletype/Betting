import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DELETE, GET, POST, setSupabaseAdminClientFactoryForTests } from "./[...path]/route";
import { getAdminPolymarketStatusPayload } from "./_shared/admin-polymarket-status";
import { GET as healthGET } from "./health/route";
import { GET as versionGET } from "./version/route";
import { GET as externalMarketsGET } from "./external/markets/route";
import { GET as externalMarketGET } from "./external/markets/[source]/[externalId]/route";
import { GET as launchStatusGET } from "./admin/launch/status/route";

const withEnv = async (values: Record<string, string | undefined>, run: () => Promise<void>) => {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const makeExternalMarketsSupabase = (options: { staleAfter?: string; translatedTitle?: string; translationLocale?: string } = {}) => ({
  from(table: string) {
    if (table === "external_market_cache") {
      const row = {
        id: "11111111-1111-4111-8111-111111111111",
        source: "polymarket",
        external_id: "POLY-ROUTE-1",
        slug: "poly-route-1",
        title: "Will the Next API proxy serve Polymarket markets?",
        description: "Route test",
        category: null,
        outcomes: [
          {
            externalOutcomeId: "yes",
            title: "Yes",
            slug: "yes",
            index: 0,
            yesNo: "yes",
            bestBid: "0.41",
            bestAsk: "0.44",
            lastPrice: "0.43",
            volume: "500",
          },
        ],
        prices: {},
        best_bid: "0.41",
        best_ask: "0.44",
        volume: "500",
        liquidity: "10000",
        close_time: null,
        resolution_status: "open",
        polymarket_url: "https://polymarket.com/event/poly-route-1",
        raw_json: {},
        source_provenance: { upstream: "gamma-api.polymarket.com" },
        first_seen_at: "2026-05-01T01:00:00.000Z",
        last_seen_at: "2026-05-01T01:00:00.000Z",
        last_synced_at: "2099-05-01T01:00:00.000Z",
        stale_after: options.staleAfter ?? "2099-05-01T01:01:00.000Z",
        is_active: true,
        is_tradable: true,
        created_at: "2026-05-01T01:00:00.000Z",
        updated_at: "2026-05-01T01:00:00.000Z",
      };

      return {
        select: () => ({
          eq: (column: string, value: string) => {
            if (column === "slug") {
              return {
                maybeSingle: async () => ({
                  data: value === row.slug ? row : null,
                  error: null,
                }),
              };
            }

            return {
              eq: (_secondColumn: string, secondValue: string) => ({
                maybeSingle: async () => ({
                  data: secondValue === row.external_id ? row : null,
                  error: null,
                }),
              }),
              order: () => ({
                order: () => ({
                  limit: async () => ({
                    data: [row],
                    error: null,
                  }),
                }),
              }),
            };
          },
        }),
        upsert: async () => ({ error: null }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    }

    if (table === "external_market_sync_runs") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: [{
                  sync_kind: "market_list",
                  status: "success",
                  started_at: "2099-05-01T01:02:00.000Z",
                  finished_at: "2099-05-01T01:02:10.000Z",
                  markets_seen: 1,
                  markets_upserted: 1,
                  error_message: null,
                  diagnostics: { source: "cache" },
                }],
                error: null,
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: "sync-run-1" }, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    }

    if (table === "external_market_translations") {
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              in: async () => ({
                data: options.translatedTitle ? [{
                  source: "polymarket",
                  external_id: "POLY-ROUTE-1",
                  locale: options.translationLocale ?? "zh-HK",
                  title_translated: options.translatedTitle,
                  description_translated: "已翻譯描述",
                  outcomes_translated: ["會"],
                  status: "translated",
                  source_content_hash: "56bd0d74d907af9b6ec02b928f47338fbe850774a9f166f16bfbd8f9e5423503",
                  translated_at: "2099-05-01T01:03:00.000Z",
                  updated_at: "2099-05-01T01:03:00.000Z",
                }] : [],
                error: null,
              }),
            }),
          }),
        }),
      };
    }

    if (table === "external_markets") {
      return {
        select: () => ({
          order: () => ({
            order: () => ({
              limit: async () => ({
                data: [
                  {
                    id: "11111111-1111-4111-8111-111111111111",
                    source: "polymarket",
                    external_id: "POLY-ROUTE-1",
                    slug: "poly-route-1",
                    title: "Will the Next API proxy serve Polymarket markets?",
                    description: "Route test",
                    status: "open",
                    market_url: "https://polymarket.com/event/poly-route-1",
                    close_time: null,
                    end_time: null,
                    resolved_at: null,
                    best_bid: "0.41",
                    best_ask: "0.44",
                    last_trade_price: "0.43",
                    volume_24h: "500",
                    volume_total: "10000",
                    last_synced_at: "2026-05-01T01:00:00.000Z",
                    created_at: "2026-05-01T01:00:00.000Z",
                    updated_at: "2026-05-01T01:00:00.000Z",
                  },
                ],
                error: null,
              }),
            }),
          }),
        }),
      };
    }

    if (table === "external_outcomes") {
      return {
        select: () => ({
          in: () => ({
            order: async () => ({
              data: [
                {
                  external_market_id: "11111111-1111-4111-8111-111111111111",
                  external_outcome_id: "yes",
                  title: "Yes",
                  slug: "yes",
                  outcome_index: 0,
                  yes_no: "yes",
                  best_bid: "0.41",
                  best_ask: "0.44",
                  last_price: "0.43",
                  volume: "500",
                },
              ],
              error: null,
            }),
          }),
        }),
      };
    }

    if (table === "external_trade_ticks") {
      return {
        select: () => ({
          in: () => ({
            order: async () => ({
              data: [
                {
                  external_market_id: "11111111-1111-4111-8111-111111111111",
                  external_trade_id: "trade-1",
                  external_outcome_id: "yes",
                  side: "buy",
                  price: "0.43",
                  size: "10",
                  traded_at: "2026-05-01T01:02:00.000Z",
                },
              ],
              error: null,
            }),
          }),
        }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  },
});

test("GET /api/external/markets serves synced external market data", async (t) => {
  setSupabaseAdminClientFactoryForTests(() => makeExternalMarketsSupabase() as never);

  t.after(() => {
    setSupabaseAdminClientFactoryForTests(null);
  });

  const response = await GET(new NextRequest("http://localhost/api/external/markets"), {
    params: Promise.resolve({ path: ["external", "markets"] }),
  });
  const payload = (await response.json()) as {
    ok: boolean;
    source: string;
    fallbackUsed: boolean;
    stale: boolean;
    markets: Array<{
      externalId: string;
      source: string;
      outcomes: Array<{ title: string }>;
      recentTrades: Array<{ externalTradeId: string }>;
    }>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "supabase_cache");
  assert.equal(payload.fallbackUsed, false);
  assert.equal(payload.stale, false);
  assert.equal(payload.markets.length, 1);
  assert.equal(payload.markets[0]?.source, "polymarket");
  assert.equal(payload.markets[0]?.externalId, "POLY-ROUTE-1");
  assert.equal(payload.markets[0]?.outcomes[0]?.title, "Yes");
});

test("GET /api/external/markets returns stale cache while refresh stays server-side", async (t) => {
  const originalFetch = globalThis.fetch;
  setSupabaseAdminClientFactoryForTests(() => makeExternalMarketsSupabase({ staleAfter: "2000-01-01T00:00:00.000Z" }) as never);
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    setSupabaseAdminClientFactoryForTests(null);
  });

  const response = await GET(new NextRequest("http://localhost/api/external/markets"), {
    params: Promise.resolve({ path: ["external", "markets"] }),
  });
  const payload = await response.json() as {
    source: string;
    fallbackUsed: boolean;
    stale: boolean;
    markets: Array<{ externalId: string }>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.source, "supabase_cache");
  assert.equal(payload.fallbackUsed, false);
  assert.equal(payload.stale, true);
  assert.equal(payload.markets[0]?.externalId, "POLY-ROUTE-1");
});

test("GET /api/external/markets accepts locale and returns localized market content", async (t) => {
  setSupabaseAdminClientFactoryForTests(() => makeExternalMarketsSupabase({
    translatedTitle: "Next API 會否提供 Polymarket 市場？",
    translationLocale: "zh-HK",
  }) as never);

  t.after(() => {
    setSupabaseAdminClientFactoryForTests(null);
  });

  const response = await GET(new NextRequest("http://localhost/api/external/markets?locale=zh-HK"), {
    params: Promise.resolve({ path: ["external", "markets"] }),
  });
  const payload = await response.json() as {
    markets: Array<{
      title: string;
      titleOriginal: string;
      titleLocalized: string;
      locale: string;
      translationStatus: string;
      outcomes: Array<{ title: string }>;
    }>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.markets[0]?.title, "Next API 會否提供 Polymarket 市場？");
  assert.equal(payload.markets[0]?.titleOriginal, "Will the Next API proxy serve Polymarket markets?");
  assert.equal(payload.markets[0]?.locale, "zh-HK");
  assert.equal(payload.markets[0]?.translationStatus, "translated");
  assert.equal(payload.markets[0]?.outcomes[0]?.title, "會");
});

test("GET /api/external/markets attempts Gamma fallback when backend cache fails", async (t) => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  setSupabaseAdminClientFactoryForTests(() => {
    throw new Error("SUPABASE_URL is required");
  });

  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("public market route must be cache-only");
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    setSupabaseAdminClientFactoryForTests(null);
  });

  const response = await GET(new NextRequest("http://localhost/api/external/markets"), {
    params: Promise.resolve({ path: ["external", "markets"] }),
  });
  const payload = (await response.json()) as {
    ok: boolean;
    source: string;
    fallbackUsed: boolean;
    markets: unknown[];
  };

  assert.equal(response.status, 503);
  assert.equal(payload.ok, false);
  assert.equal(payload.source, "supabase_cache");
  assert.equal(payload.fallbackUsed, false);
  assert.deepEqual(payload.markets, []);
  assert.equal(fetchCalled, true);
});

test("GET /api/external/markets detail, orderbook, and trades return safe JSON", async (t) => {
  setSupabaseAdminClientFactoryForTests(() => makeExternalMarketsSupabase() as never);

  t.after(() => {
    setSupabaseAdminClientFactoryForTests(null);
  });

  const detailResponse = await GET(new NextRequest("http://localhost/api/external/markets/polymarket/POLY-ROUTE-1?foo=bar"), {
    params: Promise.resolve({ path: ["external", "markets", "polymarket", "POLY-ROUTE-1"] }),
  });
  const detailPayload = await detailResponse.json() as { market: { externalId: string } | null };
  assert.equal(detailResponse.status, 200);
  assert.equal(detailPayload.market?.externalId, "POLY-ROUTE-1");

  const orderbookResponse = await GET(new NextRequest("http://localhost/api/external/markets/polymarket/POLY-ROUTE-1/orderbook?depth=20"), {
    params: Promise.resolve({ path: ["external", "markets", "polymarket", "POLY-ROUTE-1", "orderbook"] }),
  });
  assert.equal(orderbookResponse.status, 200);
  assert.deepEqual(await orderbookResponse.json(), { orderbook: [], orderbookDepth: { bids: [], asks: [] }, depth: [] });

  const tradesResponse = await GET(new NextRequest("http://localhost/api/external/markets/polymarket/POLY-ROUTE-1/trades?limit=20"), {
    params: Promise.resolve({ path: ["external", "markets", "polymarket", "POLY-ROUTE-1", "trades"] }),
  });
  const tradesPayload = await tradesResponse.json() as { source: string; externalId: string; trades: Array<{ externalTradeId: string }> };
  assert.equal(tradesResponse.status, 200);
  assert.equal(tradesPayload.source, "polymarket");
  assert.equal(tradesPayload.externalId, "POLY-ROUTE-1");
  assert.equal(tradesPayload.trades[0]?.externalTradeId, "trade-1");
});

test("public health, version, and external markets survive missing Supabase config", async (t) => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("external market browsing should not call Polymarket directly");
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }, async () => {
    assert.equal((await healthGET()).status, 200);
    assert.equal(versionGET().status, 200);

    const listResponse = await externalMarketsGET();
    assert.equal(listResponse.status, 503);
    const listPayload = await listResponse.json() as { markets?: unknown[] };
    assert.ok(Array.isArray(listPayload.markets));
    assert.equal(fetchCalled, true);

    const detailResponse = await externalMarketGET(new Request("http://localhost/api/external/markets/polymarket/missing"), {
      params: Promise.resolve({ source: "polymarket", externalId: "missing" }),
    });
    assert.equal(detailResponse.status, 404);
    const detailPayload = await detailResponse.json() as { market: null; diagnostics?: unknown };
    assert.equal(detailPayload.market, null);
  });
});

test("command routes remain protected without trusting request body user ids", async () => {
  const response = await POST(new NextRequest("http://localhost/api/ambassador/capture", {
    method: "POST",
    body: JSON.stringify({ userId: "11111111-1111-4111-8111-111111111111" }),
  }), { params: Promise.resolve({ path: ["ambassador", "capture"] }) });

  assert.equal(response.status, 401);
});

test("wallet link challenge endpoint requires auth", async () => {
  const response = await POST(new NextRequest("http://localhost/api/wallets/link/challenge", {
    method: "POST",
    body: JSON.stringify({ walletAddress: "0x1111111111111111111111111111111111111111", chain: "base" }),
  }), { params: Promise.resolve({ path: ["wallets", "link", "challenge"] }) });

  assert.equal(response.status, 401);
});

test("admin launch status rejects anonymous users and does not expose secrets", async () => {
  await withEnv({ POLYMARKET_API_SECRET: "do-not-show", POLYMARKET_ROUTED_TRADING_ENABLED: undefined, AMBASSADOR_AUTO_PAYOUT_ENABLED: undefined }, async () => {
    const response = await launchStatusGET(new NextRequest("http://localhost/api/admin/launch/status"));
    const text = await response.text();
    assert.equal(response.status, 401);
    assert.doesNotMatch(text, /do-not-show|POLYMARKET_API_SECRET/);
  });
});

test("admin catch-all endpoints reject spoofed admin headers", async () => {
  const response = await GET(new NextRequest("http://localhost/api/admin/ambassador", {
    headers: {
      "x-user-id": "11111111-1111-4111-8111-111111111111",
      "x-admin": "true",
      "x-role": "admin",
    },
  }), { params: Promise.resolve({ path: ["admin", "ambassador"] }) });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});

test("admin ambassador dashboard health rejects spoofed admin headers", async () => {
  const response = await GET(new NextRequest("http://localhost/api/admin/ambassador-dashboard-health", {
    headers: {
      "x-user-id": "11111111-1111-4111-8111-111111111111",
      "x-admin": "true",
      "x-role": "admin",
    },
  }), { params: Promise.resolve({ path: ["admin", "ambassador-dashboard-health"] }) });

  assert.equal(response.status, 401);
  const text = await response.text();
  assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|service-role|DATABASE_URL|Bearer/i);
});

test("ambassador dashboard rejects spoofed user headers", async () => {
  const response = await GET(new NextRequest("http://localhost/api/ambassador/dashboard", {
    headers: {
      "x-user-id": "11111111-1111-4111-8111-111111111111",
      "x-admin": "true",
    },
  }), { params: Promise.resolve({ path: ["ambassador", "dashboard"] }) });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required", code: "dashboard_auth_missing" });
});

test("ambassador dashboard auth uses Supabase cookies and forwarded bearer only", () => {
  const apiClient = readFileSync(resolve(process.cwd(), "src/lib/api.ts"), "utf8");
  const webAuth = readFileSync(resolve(process.cwd(), "src/app/api/auth.ts"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "src/app/api/[...path]/route.ts"), "utf8");

  assert.match(apiClient, /getServerCookieHeader/);
  assert.match(apiClient, /headers\.cookie = cookieHeader/);
  assert.match(apiClient, /headers\.authorization = `Bearer \$\{accessToken\}`/);
  assert.match(webAuth, /request\.cookies\.get\(name\)\?\.value/);
  assert.doesNotMatch(webAuth, /x-user-id|x-admin/);
  assert.doesNotMatch(route, /request\.headers\.get\("x-user-id"\)|request\.headers\.get\("x-admin"\)/);
});

test("frontend code does not expose Supabase service-role keys", () => {
  const frontendFiles = [
    "src/lib/api.ts",
    "src/app/app-shell.tsx",
    "src/app/ambassador/page.tsx",
    "src/app/auth-session.ts",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

  assert.doesNotMatch(frontendFiles, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("admin Polymarket status is protected and reports cache sync audit", async () => {
  setSupabaseAdminClientFactoryForTests(() => makeExternalMarketsSupabase() as never);
  try {
    const anonymousResponse = await GET(new NextRequest("http://localhost/api/admin/polymarket/status"), {
      params: Promise.resolve({ path: ["admin", "polymarket", "status"] }),
    });
    assert.equal(anonymousResponse.status, 401);

    const payload = await getAdminPolymarketStatusPayload(() => makeExternalMarketsSupabase() as never);
    assert.equal(payload.source, "polymarket");
    assert.deepEqual(payload.marketCounts, { total: 1, open: 1, stale: 0, errored: 0 });
    assert.equal(payload.recentRuns[0]?.syncKind, "market_list");
    assert.equal(payload.recentRuns[0]?.status, "success");
    assert.equal(payload.recentRuns[0]?.startedAt, "2099-05-01T01:02:00.000Z");
    assert.equal(payload.preflight.routedTradingEnabled, false);
  } finally {
    setSupabaseAdminClientFactoryForTests(null);
  }
});

test("Polymarket submit route enforces local routed trading readiness before forwarding", () => {
  const route = readFileSync(resolve(process.cwd(), "src/app/api/[...path]/route.ts"), "utf8");

  assert.match(route, /POLYMARKET_ROUTED_TRADING_ENABLED/);
  assert.match(route, /POLYMARKET_ROUTED_TRADING_BETA_ENABLED/);
  assert.match(route, /isPolymarketRoutedTradingAllowlisted/);
  assert.match(route, /getPolymarketBuilderCode/);
  assert.match(route, /POLYMARKET_BUILDER_CODE_MISSING/);
  assert.match(route, /POLYMARKET_SUBMITTER_UNAVAILABLE/);
  assert.match(route, /linked_wallets/);
  assert.match(route, /polymarket_l2_credentials/);
  assert.match(route, /wallet_not_connected/);
  assert.match(route, /credentials_missing/);
});

test("public API routes do not import command modules that mutate balances or ledger", () => {
  const publicFiles = [
    "src/app/api/external/markets/route.ts",
    "src/app/api/external/markets/[source]/[externalId]/route.ts",
    "src/app/api/_shared/public-external-market-routes.ts",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
  assert.doesNotMatch(publicFiles, /rpc_place_order|ledger|withdrawal|ambassador_reward_payouts|createOrder|requestWithdrawal/);
});

test("web API quarantines legacy internal exchange endpoints by default", async () => {
  await withEnv({ INTERNAL_EXCHANGE_ENABLED: undefined }, async () => {
    for (const [method, path] of [
      ["GET", "markets"],
      ["GET", "markets/market-1/orderbook"],
      ["POST", "orders"],
      ["DELETE", "orders/order-1"],
      ["GET", "portfolio"],
      ["GET", "claims"],
      ["POST", "claims/market-1"],
      ["POST", "claims/market-1/state"],
      ["GET", "deposits"],
      ["POST", "deposits/verify"],
      ["GET", "withdrawals"],
      ["POST", "withdrawals"],
    ] as const) {
      const handler = method === "GET" ? GET : method === "POST" ? POST : DELETE;
      const response = await handler(
        new NextRequest(`http://localhost/api/${path}`, {
          method,
          body: method === "GET" ? undefined : JSON.stringify({}),
        }),
        { params: Promise.resolve({ path: path.split("/") }) },
      );
      const payload = await response.json() as { code?: string };
      assert.equal(response.status, 404, `${method} /api/${path}`);
      assert.equal(payload.code, "INTERNAL_EXCHANGE_DISABLED", `${method} /api/${path}`);
    }
  });
});

test("external market UI does not import internal ledger or balance modules", () => {
  const uiFiles = [
    "src/app/external-markets/external-markets-page.tsx",
    "src/app/external-markets/polymarket-trade-ticket.tsx",
    "src/app/thirdweb-wallet-funding-card.tsx",
    "src/app/polymarket/[slug]/page.tsx",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");

  assert.doesNotMatch(uiFiles, /@bet\/ledger|packages\/ledger|portfolio\/balances|requestWithdrawal|verifyDepositTx|createOrder/);
});

test("admin payout approval exposes safe risk review error and UI risk summary", () => {
  const route = readFileSync(resolve(process.cwd(), "src/app/api/[...path]/route.ts"), "utf8");
  const sharedAmbassador = readFileSync(resolve(process.cwd(), "src/app/api/_shared/ambassador.ts"), "utf8");
  const payoutPage = readFileSync(resolve(process.cwd(), "src/app/admin/payouts/page.tsx"), "utf8");

  assert.match(sharedAmbassador, /AMBASSADOR_PAYOUT_RISK_REVIEW_REQUIRED/);
  assert.match(sharedAmbassador, /flag\.payout_id = payout\.id/);
  assert.match(sharedAmbassador, /flag\.referral_attribution_id in \(select id from related_referral_attributions\)/);
  assert.match(sharedAmbassador, /flag\.trade_attribution_id in \(select id from related_trade_attributions\)/);
  assert.match(route, /ambassadorPayoutRiskReviewRequiredMessage/);
  assert.match(sharedAmbassador, /high-severity risk review is required before payout approval/);
  assert.match(payoutPage, /flag\.severity/);
  assert.match(payoutPage, /flag\.status/);
  assert.match(payoutPage, /flag\.reasonCode/);
  assert.match(payoutPage, /pattern=\{polygonTxHashPattern\}/);
  assert.match(payoutPage, /Polygon tx hash must be a 32-byte 0x hash/);
  assert.match(payoutPage, /此頁不會自動發送 crypto/);
  assert.match(payoutPage, /safeAuditMetadata/);
  assert.doesNotMatch(payoutPage, /flag\.details/);
  assert.doesNotMatch(payoutPage, /JSON\.stringify\(entry\.metadata\)/);
});

test("admin routes use granular RBAC and payout dual control", () => {
  const auth = readFileSync(resolve(process.cwd(), "src/app/api/auth.ts"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "src/app/api/[...path]/route.ts"), "utf8");
  const adminActions = readFileSync(resolve(process.cwd(), "src/app/admin/actions.ts"), "utf8");
  const serverAuth = readFileSync(resolve(process.cwd(), "src/lib/supabase/server.ts"), "utf8");

  assert.match(auth, /finance_reviewer/);
  assert.match(auth, /finance_approver/);
  assert.match(auth, /trading_config_admin/);
  assert.match(auth, /evaluateAdminPermission/);
  assert.match(auth, /risk_flag:review/);
  assert.match(auth, /risk_flag:dismiss/);
  assert.match(route, /evaluateAdminPermission/);
  assert.match(route, /ADMIN_PERMISSION_REQUIRED/);
  assert.match(route, /ambassador_code:manage/);
  assert.match(route, /referral_attribution:override/);
  assert.match(route, /builder_trade_attribution:record/);
  assert.match(route, /reward_ledger:review/);
  assert.match(route, /risk_flag:review/);
  assert.match(route, /risk_flag:dismiss/);
  assert.match(route, /payout:approve/);
  assert.match(route, /payout:mark_paid/);
  assert.match(route, /AMBASSADOR_PAYOUT_DUAL_CONTROL_THRESHOLD_USDC_ATOMS/);
  assert.match(route, /payout requires a different admin to mark paid after approval/);
  assert.match(adminActions, /reviewAdminRiskFlag/);
  assert.match(adminActions, /dismissAdminRiskFlag/);
  assert.doesNotMatch(adminActions, /updateAdminRiskFlagReviewState/);
  assert.match(serverAuth, /isAdminRole/);
});

test("admin pages surface referral reward payout and Polymarket operator fields", () => {
  const ambassadorPage = readFileSync(resolve(process.cwd(), "src/app/admin/ambassadors/page.tsx"), "utf8");
  const rewardsPage = readFileSync(resolve(process.cwd(), "src/app/admin/rewards/page.tsx"), "utf8");
  const payoutsPage = readFileSync(resolve(process.cwd(), "src/app/admin/payouts/page.tsx"), "utf8");
  const polymarketPage = readFileSync(resolve(process.cwd(), "src/app/admin/polymarket/page.tsx"), "utf8");
  const publicMarketPage = readFileSync(resolve(process.cwd(), "src/app/external-markets/external-markets-page.tsx"), "utf8");

  assert.match(ambassadorPage, /Direct referred user/);
  assert.match(ambassadorPage, /Rejected attribution attempts/);
  assert.match(ambassadorPage, /已停用推薦碼/);
  assert.match(ambassadorPage, /Suspicious flags/);
  assert.match(rewardsPage, /Builder attribution source/);
  assert.match(rewardsPage, /平台分帳/);
  assert.match(rewardsPage, /推薦人分帳/);
  assert.match(rewardsPage, /交易者分帳/);
  assert.match(rewardsPage, /Duplicate \/ idempotency/);
  assert.match(payoutsPage, /Wallet address/);
  assert.match(payoutsPage, /Polygon \{payout\.payoutChainId\}/);
  assert.match(payoutsPage, /Admin notes/);
  assert.match(polymarketPage, /Source URLs \/ debug info/);
  assert.match(polymarketPage, /gamma-api\.polymarket\.com\/events/);
  assert.doesNotMatch(publicMarketPage, /Open on Polymarket|前往 Polymarket|gamma-api\.polymarket\.com\/events/);
});

test("production catch-all errors are sanitized", async () => {
  setSupabaseAdminClientFactoryForTests(() => {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY super secret exploded");
  });
  await withEnv({ NODE_ENV: "production" }, async () => {
    const response = await GET(new NextRequest("http://localhost/api/external/markets/polymarket/missing"), {
      params: Promise.resolve({ path: ["external", "markets", "polymarket", "missing"] }),
    });
    const payload = await response.json() as { error: string; code: string };
    assert.notEqual(response.status, 200);
    assert.doesNotMatch(JSON.stringify(payload), /SERVICE_ROLE|super secret|SUPABASE_SERVICE_ROLE_KEY/);
  });
  setSupabaseAdminClientFactoryForTests(null);
});
