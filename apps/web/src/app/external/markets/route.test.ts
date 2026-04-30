import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";
import { externalMarketDetailResponse, externalMarketsResponse } from "../../api/_shared/public-external-market-routes";

const makeCacheRow = (overrides: Record<string, unknown> = {}) => ({
  id: overrides.id ?? "row-open",
  source: "polymarket",
  external_id: overrides.external_id ?? "OPEN-1",
  slug: overrides.slug ?? "open-1",
  title: overrides.title ?? "Open market",
  description: overrides.description ?? "",
  category: null,
  outcomes: [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", outcomeIndex: 0, yesNo: "yes", lastPrice: 0.5 }],
  prices: {},
  best_bid: 0.49,
  best_ask: 0.51,
  volume: 100,
  liquidity: 100,
  close_time: overrides.close_time ?? "2099-01-01T00:00:00.000Z",
  resolution_status: overrides.resolution_status ?? "open",
  polymarket_url: "https://polymarket.com/event/open-1",
  raw_json: {},
  source_provenance: {},
  first_seen_at: "2026-04-30T00:00:00.000Z",
  last_seen_at: "2026-04-30T00:00:00.000Z",
  last_synced_at: "2026-04-30T00:00:00.000Z",
  stale_after: overrides.stale_after ?? "2099-01-01T00:00:00.000Z",
  is_active: overrides.is_active ?? true,
  is_tradable: overrides.is_tradable ?? true,
  created_at: "2026-04-30T00:00:00.000Z",
  updated_at: "2026-04-30T00:00:00.000Z",
});

const makeFakeSupabaseFactory = (rows: ReturnType<typeof makeCacheRow>[]) => () => ({
  from(table: string) {
    if (table === "external_market_cache") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              order: () => ({
                limit: async () => ({ data: rows, error: null, count: rows.length }),
              }),
            }),
          }),
        }),
      };
    }

    if (table === "external_market_sync_runs") {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [{ status: "success" }], error: null }),
            }),
          }),
        }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  },
});

test("GET /external/markets works without login and attempts Gamma fallback when cache config is missing", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let fetchCalled = false;

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("public market route must be cache-only");
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
  });

  const response = await GET();
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

test("GET /external/markets returns clear JSON error when backend and Gamma fail", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "upstream down" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalSupabaseUrl;
    if (originalServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRole;
  });

  const response = await GET();
  const payload = (await response.json()) as {
    ok: boolean;
    error: string;
    source: string;
    message: string;
  };

  assert.equal(response.status, 503);
  assert.deepEqual(
    { ok: payload.ok, error: payload.error, source: payload.source, message: payload.message },
    {
      ok: false,
      error: "MARKET_SOURCE_UNAVAILABLE",
      source: "supabase_cache",
      message: "Configured market data sources are temporarily unavailable.",
    },
  );
});

test("GET /external/markets defaults to open rows and supports explicit status filters", async () => {
  const rows = [
    makeCacheRow({ id: "open", external_id: "OPEN-1", slug: "open-1", title: "Open market" }),
    makeCacheRow({ id: "past", external_id: "PAST-1", slug: "past-1", title: "Past close market", close_time: "2000-01-01T00:00:00.000Z" }),
    makeCacheRow({ id: "resolved", external_id: "RESOLVED-1", slug: "resolved-1", title: "Resolved market", resolution_status: "resolved", is_active: false }),
  ];

  const openResponse = await externalMarketsResponse(
    new Request("http://127.0.0.1/api/external/markets?locale=en"),
    makeFakeSupabaseFactory(rows) as never,
  );
  const openPayload = await openResponse.json() as { markets: Array<{ title: string; status: string }> };
  assert.deepEqual(openPayload.markets.map((market) => `${market.title}:${market.status}`), ["Open market:open"]);

  const closedResponse = await externalMarketsResponse(
    new Request("http://127.0.0.1/api/external/markets?locale=en&status=closed"),
    makeFakeSupabaseFactory(rows) as never,
  );
  const closedPayload = await closedResponse.json() as { markets: Array<{ title: string; status: string }> };
  assert.deepEqual(closedPayload.markets.map((market) => `${market.title}:${market.status}`), ["Past close market:closed"]);

  const allResponse = await externalMarketsResponse(
    new Request("http://127.0.0.1/api/external/markets?locale=en&status=all"),
    makeFakeSupabaseFactory(rows) as never,
  );
  const allPayload = await allResponse.json() as { markets: Array<{ title: string; status: string }> };
  assert.deepEqual(allPayload.markets.map((market) => market.status), ["open", "closed", "resolved"]);
});

test("GET /external/markets uses Gamma fallback when cache has only stale closed markets", async (t) => {
  const originalFetch = globalThis.fetch;
  const rows = [
    makeCacheRow({
      id: "closed-stale",
      external_id: "CLOSED-STALE-1",
      slug: "closed-stale-1",
      title: "Closed stale cache market",
      close_time: "2000-01-01T00:00:00.000Z",
      stale_after: "2000-01-01T00:00:00.000Z",
      is_active: false,
    }),
  ];

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify([
        {
          id: "event-1",
          slug: "fresh-event",
          title: "Fresh fallback event",
          question: "Fresh fallback event?",
          description: "Fresh fallback description",
          active: true,
          closed: false,
          endDate: "2099-01-01T00:00:00.000Z",
          volume: "1000",
          volume24hr: "100",
          markets: [
            {
              id: "FRESH-FALLBACK-1",
              slug: "fresh-fallback-1",
              question: "Fresh fallback market?",
              active: true,
              closed: false,
              endDate: "2099-01-01T00:00:00.000Z",
              volume: "1000",
              volume24hr: "100",
              outcomes: ["Yes", "No"],
              outcomePrices: ["0.55", "0.45"],
              clobTokenIds: ["yes-token", "no-token"],
            },
          ],
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await externalMarketsResponse(
    new Request("http://127.0.0.1/api/external/markets?locale=en"),
    makeFakeSupabaseFactory(rows) as never,
  );
  const payload = await response.json() as {
    source: string;
    fallbackUsed: boolean;
    stale: boolean;
    markets: Array<{ externalId: string; status: string; title: string }>;
    diagnostics: { fallbackUsedLastRequest: boolean };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.source, "polymarket_gamma_fallback");
  assert.equal(payload.fallbackUsed, true);
  assert.equal(payload.stale, false);
  assert.deepEqual(payload.markets.map((market) => `${market.externalId}:${market.status}`), ["FRESH-FALLBACK-1:open"]);
  assert.equal(payload.diagnostics.fallbackUsedLastRequest, true);
});

test("external market detail uses Gamma event-list fallback for feed slug", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/markets?")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }

    return new Response(
      JSON.stringify([
        {
          id: "event-norway",
          slug: "will-norway-win-the-2026-fifa-world-cup-893",
          title: "World Cup winner",
          question: "World Cup winner?",
          description: "World Cup event",
          active: true,
          closed: false,
          endDate: "2099-01-01T00:00:00.000Z",
          volume: "1000",
          volume24hr: "100",
          markets: [
            {
              id: "POLY-NORWAY",
              slug: "will-norway-win-the-2026-fifa-world-cup-893",
              question: "Will Norway win the 2026 FIFA World Cup?",
              active: true,
              closed: false,
              endDate: "2099-01-01T00:00:00.000Z",
              volume: "1000",
              volume24hr: "100",
              outcomes: ["Yes", "No"],
              outcomePrices: ["0.11", "0.89"],
              clobTokenIds: ["yes-token", "no-token"],
            },
          ],
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await externalMarketDetailResponse(
    "polymarket",
    "will-norway-win-the-2026-fifa-world-cup-893",
    new Request("http://127.0.0.1/api/external/markets/polymarket/will-norway-win-the-2026-fifa-world-cup-893"),
    (() => {
      throw new Error("cache unavailable");
    }) as never,
  );
  const payload = await response.json() as {
    market: { externalId: string; slug: string; title: string } | null;
    diagnostics: { gammaFallbackUsed: boolean; source: string };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.market?.externalId, "POLY-NORWAY");
  assert.equal(payload.market?.slug, "will-norway-win-the-2026-fifa-world-cup-893");
  assert.equal(payload.diagnostics.gammaFallbackUsed, true);
  assert.equal(payload.diagnostics.source, "polymarket_gamma_detail_fallback");
});

test("external market detail normalizes numeric suffix and uses Gamma slug endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/markets/slug/will-norway-win-the-2026-fifa-world-cup-893")) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/events/slug/will-norway-win-the-2026-fifa-world-cup-893")) {
      return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/markets/slug/will-norway-win-the-2026-fifa-world-cup")) {
      return new Response(
        JSON.stringify({
          id: 558403,
          slug: "will-norway-win-the-2026-fifa-world-cup",
          question: "Will Norway win the 2026 FIFA World Cup?",
          description: "Norway outright winner market",
          active: true,
          closed: false,
          archived: false,
          restricted: false,
          endDate: "2099-07-19T00:00:00.000Z",
          volume: "1000",
          volume24hr: "100",
          outcomes: ["Yes", "No"],
          outcomePrices: ["0.11", "0.89"],
          clobTokenIds: ["yes-token", "no-token"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "unexpected" }), { status: 500, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await externalMarketDetailResponse(
    "polymarket",
    "will-norway-win-the-2026-fifa-world-cup-893",
    new Request("http://127.0.0.1/api/external/markets/polymarket/will-norway-win-the-2026-fifa-world-cup-893"),
    (() => {
      throw new Error("cache unavailable");
    }) as never,
  );
  const payload = await response.json() as {
    market: { externalId: string; slug: string; title: string; sourceProvenance: { endpoint: string; fetchedVia: string } } | null;
    diagnostics: { gammaFallbackUsed: boolean; canonicalSlug: string };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.market?.externalId, "558403");
  assert.equal(payload.market?.slug, "will-norway-win-the-2026-fifa-world-cup");
  assert.equal(payload.market?.title, "Will Norway win the 2026 FIFA World Cup?");
  assert.equal(payload.market?.sourceProvenance.endpoint, "/markets/slug/will-norway-win-the-2026-fifa-world-cup");
  assert.equal(payload.market?.sourceProvenance.fetchedVia, "public-gamma-detail-fallback");
  assert.equal(payload.diagnostics.gammaFallbackUsed, true);
  assert.equal(payload.diagnostics.canonicalSlug, "will-norway-win-the-2026-fifa-world-cup");
  assert.deepEqual(calls.slice(0, 3).map((url) => new URL(url).pathname), [
    "/markets/slug/will-norway-win-the-2026-fifa-world-cup-893",
    "/events/slug/will-norway-win-the-2026-fifa-world-cup-893",
    "/markets/slug/will-norway-win-the-2026-fifa-world-cup",
  ]);
});
