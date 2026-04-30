import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GET, POST, setSupabaseAdminClientFactoryForTests } from "./[...path]/route";
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

const makeExternalMarketsSupabase = (options: { staleAfter?: string } = {}) => ({
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

test("GET /api/external/markets does not call Polymarket when backend cache fails", async (t) => {
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
  assert.equal(fetchCalled, false);
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
  assert.deepEqual(await orderbookResponse.json(), { orderbook: [], depth: [] });

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
    assert.equal(fetchCalled, false);

    const detailResponse = await externalMarketGET(new Request("http://localhost/api/external/markets/polymarket/missing"), {
      params: Promise.resolve({ source: "polymarket", externalId: "missing" }),
    });
    assert.equal(detailResponse.status, 404);
    assert.deepEqual(await detailResponse.json(), { market: null });
  });
});

test("command routes remain protected without trusting request body user ids", async () => {
  const response = await POST(new NextRequest("http://localhost/api/orders", {
    method: "POST",
    body: JSON.stringify({ userId: "11111111-1111-4111-8111-111111111111" }),
  }), { params: Promise.resolve({ path: ["orders"] }) });

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

test("public API routes do not import command modules that mutate balances or ledger", () => {
  const publicFiles = [
    "src/app/api/external/markets/route.ts",
    "src/app/api/external/markets/[source]/[externalId]/route.ts",
    "src/app/api/_shared/public-external-market-routes.ts",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
  assert.doesNotMatch(publicFiles, /rpc_place_order|ledger|withdrawal|ambassador_reward_payouts|createOrder|requestWithdrawal/);
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
  assert.doesNotMatch(payoutPage, /flag\.details/);
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
