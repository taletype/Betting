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
    assert.equal(String(input), "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=200");
    return new Response(
      JSON.stringify([
        {
          id: "gamma-1",
          slug: "will-public-gamma-load",
          question: "Will public Gamma data load?",
          active: true,
          closed: false,
          outcomes: JSON.stringify(["Yes", "No"]),
          outcomePrices: JSON.stringify(["0.61", "0.39"]),
          clobTokenIds: JSON.stringify(["yes-token", "no-token"]),
          volume: "1234",
          volume24hr: "56",
          endDate: "2026-06-01T00:00:00.000Z",
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
  const payload = (await response.json()) as Array<{
    source: string;
    externalId: string;
    title: string;
    outcomes: Array<{ title: string; lastPrice: number | null }>;
    sourceProvenance: { upstream?: string };
  }>;

  assert.equal(response.status, 200);
  assert.equal(payload[0]?.source, "polymarket");
  assert.equal(payload[0]?.externalId, "gamma-1");
  assert.equal(payload[0]?.title, "Will public Gamma data load?");
  assert.equal(payload[0]?.outcomes[0]?.title, "Yes");
  assert.equal(payload[0]?.outcomes[0]?.lastPrice, 0.61);
  assert.equal(payload[0]?.sourceProvenance.upstream, "gamma-api.polymarket.com");
});
