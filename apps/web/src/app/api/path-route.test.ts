import assert from "node:assert/strict";
import test from "node:test";

import { NextRequest } from "next/server";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GET, POST, setSupabaseAdminClientFactoryForTests } from "./[...path]/route";
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

const makeExternalMarketsSupabase = () => ({
  from(table: string) {
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
  const payload = (await response.json()) as Array<{
    externalId: string;
    source: string;
    outcomes: Array<{ title: string }>;
    recentTrades: Array<{ externalTradeId: string }>;
  }>;

  assert.equal(response.status, 200);
  assert.equal(payload.length, 1);
  assert.equal(payload[0]?.source, "polymarket");
  assert.equal(payload[0]?.externalId, "POLY-ROUTE-1");
  assert.equal(payload[0]?.outcomes[0]?.title, "Yes");
  assert.equal(payload[0]?.recentTrades[0]?.externalTradeId, "trade-1");
});

test("GET /api/external/markets falls back to public Gamma events when backend fails", async (t) => {
  const originalFetch = globalThis.fetch;
  setSupabaseAdminClientFactoryForTests(() => {
    throw new Error("SUPABASE_URL is required");
  });

  globalThis.fetch = (async (input) => {
    assert.equal(String(input), "https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=50");
    return new Response(
      JSON.stringify([
        {
          id: "event-route-1",
          slug: "route-fallback-event",
          title: "Route fallback event",
          active: true,
          closed: false,
          markets: [
            {
              id: "gamma-route-1",
              slug: "gamma-route-fallback",
              question: "Will the API route fall back to Gamma?",
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.7", "0.3"]),
              clobTokenIds: JSON.stringify(["yes-route", "no-route"]),
            },
          ],
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    setSupabaseAdminClientFactoryForTests(null);
  });

  const response = await GET(new NextRequest("http://localhost/api/external/markets"), {
    params: Promise.resolve({ path: ["external", "markets"] }),
  });
  const payload = (await response.json()) as Array<{
    externalId: string;
    source: string;
    title: string;
    outcomes: Array<{ title: string; lastPrice: number | null }>;
  }>;

  assert.equal(response.status, 200);
  assert.equal(payload[0]?.source, "polymarket");
  assert.equal(payload[0]?.externalId, "gamma-route-1");
  assert.equal(payload[0]?.title, "Will the API route fall back to Gamma?");
  assert.equal(payload[0]?.outcomes[0]?.lastPrice, 0.7);
});

test("public health, version, and external markets survive missing Supabase config", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify([]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined, NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined }, async () => {
    assert.equal((await healthGET()).status, 200);
    assert.equal(versionGET().status, 200);

    const listResponse = await externalMarketsGET();
    assert.equal(listResponse.status, 200);
    assert.ok(Array.isArray(await listResponse.json()));

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

test("public API routes do not import command modules that mutate balances or ledger", () => {
  const publicFiles = [
    "src/app/api/external/markets/route.ts",
    "src/app/api/external/markets/[source]/[externalId]/route.ts",
    "src/app/api/_shared/public-external-market-routes.ts",
  ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
  assert.doesNotMatch(publicFiles, /rpc_place_order|ledger|withdrawal|ambassador_reward_payouts|createOrder|requestWithdrawal/);
});

test("production catch-all errors are sanitized", async () => {
  setSupabaseAdminClientFactoryForTests(() => {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY super secret exploded");
  });
  await withEnv({ NODE_ENV: "production" }, async () => {
    const response = await GET(new NextRequest("http://localhost/api/markets/bad"), {
      params: Promise.resolve({ path: ["markets", "bad"] }),
    });
    const payload = await response.json() as { error: string; code: string };
    assert.equal(response.status, 500);
    assert.deepEqual(payload, { error: "Supabase environment variables are missing or invalid", code: "SUPABASE_ENV_MISSING" });
  });
  setSupabaseAdminClientFactoryForTests(null);
});
