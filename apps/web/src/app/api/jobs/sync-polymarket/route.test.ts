import assert from "node:assert/strict";
import test from "node:test";

import { handleSyncPolymarketJob } from "./route";

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

const makeEvent = (id: string) => ({
  id: `event-${id}`,
  slug: `event-${id}`,
  title: `Event ${id}`,
  question: `Event ${id}?`,
  active: true,
  closed: false,
  endDate: "2099-01-01T00:00:00.000Z",
  volume: "100",
  volume24hr: "10",
  markets: [{
    id,
    slug: `market-${id}`,
    question: `Market ${id}?`,
    active: true,
    closed: false,
    endDate: "2099-01-01T00:00:00.000Z",
    volume: "100",
    volume24hr: "10",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.5", "0.5"],
    clobTokenIds: [`yes-${id}`, `no-${id}`],
  }],
});

const makeSupabase = () => ({
  from(table: string) {
    if (table === "external_market_sync_runs") {
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: "run-1" }, error: null }),
          }),
        }),
        update: () => ({
          eq: async () => ({ error: null }),
        }),
      };
    }

    if (table === "external_market_cache") {
      return {
        upsert: async (rows: unknown[]) => ({ data: rows, error: null }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  },
});

test("sync job is protected by the cron secret convention", async () => {
  await withEnv({ CRON_SECRET: "secret" }, async () => {
    const response = await handleSyncPolymarketJob(
      new Request("http://localhost/api/jobs/sync-polymarket"),
      () => makeSupabase() as never,
    );
    assert.equal(response.status, 401);
  });
});

test("default sync job uses all_open and bounded timeout-safe pages", async (t) => {
  const originalFetch = globalThis.fetch;
  const offsets: string[] = [];

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    offsets.push(url.searchParams.get("offset") ?? "");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    return new Response(JSON.stringify(Array.from({ length: 100 }, (_, index) => makeEvent(`default-${offset + index}`))), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ CRON_SECRET: "secret" }, async () => {
    const response = await handleSyncPolymarketJob(
      new Request("http://localhost/api/jobs/sync-polymarket", { headers: { "x-cron-secret": "secret" } }),
      () => makeSupabase() as never,
    );
    const payload = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 200);
    assert.equal(payload.syncMode, "all_open");
    assert.equal(payload.pagesFetched, 5);
    assert.equal(payload.nextOffset, 500);
    assert.equal(payload.privateTradingEndpointsUsed, false);
    assert.deepEqual(offsets, ["0", "100", "200", "300", "400"]);
  });
});

test("sync job accepts bounded params and rejects invalid mode", async (t) => {
  const originalFetch = globalThis.fetch;
  const offsets: string[] = [];

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    offsets.push(url.searchParams.get("offset") ?? "");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Number(url.searchParams.get("limit") ?? 25);
    return new Response(JSON.stringify(Array.from({ length: limit }, (_, index) => makeEvent(`bounded-${offset + index}`))), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ CRON_SECRET: "secret" }, async () => {
    const invalid = await handleSyncPolymarketJob(
      new Request("http://localhost/api/jobs/sync-polymarket?mode=private", { headers: { authorization: "Bearer secret" } }),
      () => makeSupabase() as never,
    );
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { ok: false, error: "INVALID_SYNC_MODE" });

    const bounded = await handleSyncPolymarketJob(
      new Request("http://localhost/api/jobs/sync-polymarket?mode=all_open&pageSize=25&maxPages=2&maxMarkets=50&offset=75", {
        headers: { authorization: "Bearer secret" },
      }),
      () => makeSupabase() as never,
    );
    const payload = await bounded.json() as Record<string, unknown>;

    assert.equal(bounded.status, 200);
    assert.equal(payload.pagesFetched, 2);
    assert.equal(payload.startOffset, 75);
    assert.equal(payload.nextOffset, 125);
    assert.deepEqual(offsets, ["75", "100"]);
  });
});

test("sync job hides raw upstream error details", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response("secret upstream body", { status: 503 })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await withEnv({ CRON_SECRET: "secret" }, async () => {
    const response = await handleSyncPolymarketJob(
      new Request("http://localhost/api/jobs/sync-polymarket?maxPages=1", { headers: { "x-cron-secret": "secret" } }),
      () => makeSupabase() as never,
    );
    const payload = await response.json() as Record<string, unknown>;

    assert.equal(response.status, 500);
    assert.equal(payload.error, "SYNC_FAILED");
    assert.equal("secret upstream body" in payload, false);
    assert.equal(payload.privateTradingEndpointsUsed, false);
  });
});
