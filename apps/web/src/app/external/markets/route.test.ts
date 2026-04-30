import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "./route";

test("GET /external/markets works without login but does not call Polymarket directly", async (t) => {
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
  assert.equal(fetchCalled, false);
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
