import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("GET /external/markets works without login using public Polymarket Gamma fallback", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalSupabaseUrl = process.env.SUPABASE_URL;
  const originalServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  globalThis.fetch = (async (input) => {
    assert.equal(String(input), "https://gamma-api.polymarket.com/events?active=true&closed=false&order=volume_24hr&ascending=false&limit=50");
    return new Response(
      JSON.stringify([
        {
          id: "event-1",
          slug: "public-gamma-event",
          title: "Public Gamma event",
          active: true,
          closed: false,
          volume: "1234",
          volume24hr: "56",
          endDate: "2026-06-01T00:00:00.000Z",
          markets: [
            {
              id: "gamma-1",
              slug: "will-public-gamma-load",
              question: "Will public Gamma data load?",
              outcomes: JSON.stringify(["Yes", "No"]),
              outcomePrices: JSON.stringify(["0.61", "0.39"]),
              clobTokenIds: JSON.stringify(["yes-token", "no-token"]),
            },
          ],
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
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
    markets: Array<{
      source: string;
      externalId: string;
      title: string;
      outcomes: Array<{ title: string; lastPrice: number | null }>;
      sourceProvenance: { upstream?: string };
    }>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.source, "polymarket_public_fallback");
  assert.equal(payload.fallbackUsed, true);
  assert.equal(payload.markets[0]?.source, "polymarket");
  assert.equal(payload.markets[0]?.externalId, "gamma-1");
  assert.equal(payload.markets[0]?.title, "Will public Gamma data load?");
  assert.equal(payload.markets[0]?.outcomes[0]?.title, "Yes");
  assert.equal(payload.markets[0]?.outcomes[0]?.lastPrice, 0.61);
  assert.equal(payload.markets[0]?.sourceProvenance.upstream, "gamma-api.polymarket.com");
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
      source: "supabase_cache,gamma-api.polymarket.com/events",
      message: "Configured market data sources are temporarily unavailable.",
    },
  );
});
