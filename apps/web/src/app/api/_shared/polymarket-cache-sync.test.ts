import assert from "node:assert/strict";
import test from "node:test";

import { syncPolymarketMarketCache } from "./polymarket-cache-sync";

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

const makeSupabase = () => {
  const state = {
    insertedRuns: [] as Record<string, unknown>[],
    finishedRuns: [] as Record<string, unknown>[],
    upserts: [] as unknown[][],
  };

  return {
    state,
    client: {
      from(table: string) {
        if (table === "external_market_sync_runs") {
          return {
            insert: (values: Record<string, unknown>) => ({
              select: () => ({
                single: async () => {
                  state.insertedRuns.push(values);
                  return { data: { id: "run-1" }, error: null };
                },
              }),
            }),
            update: (values: Record<string, unknown>) => ({
              eq: async () => {
                state.finishedRuns.push(values);
                return { error: null };
              },
            }),
          };
        }

        if (table === "external_market_cache") {
          return {
            upsert: async (rows: unknown[]) => {
              state.upserts.push(rows);
              return { error: null };
            },
          };
        }

        throw new Error(`unexpected table ${table}`);
      },
    },
  };
};

test("smart mode keeps current limited one-page behavior", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const supabase = makeSupabase();

  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify([makeEvent("smart")]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await syncPolymarketMarketCache(supabase.client as never, { mode: "smart", limit: 25 });
  const url = new URL(calls[0] ?? "");

  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.get("offset"), "0");
  assert.equal(result.status, "success");
  assert.equal(result.syncMode, "smart");
  assert.equal(result.pagesFetched, 1);
  assert.equal(result.marketsSeen, 1);
  assert.equal(supabase.state.upserts[0]?.length, 1);
});

test("all_open mode uses paginated fetch and reports maxMarketsReached", async (t) => {
  const originalFetch = globalThis.fetch;
  const offsets: string[] = [];
  const supabase = makeSupabase();

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    offsets.push(url.searchParams.get("offset") ?? "");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const payload = offset === 0 ? [makeEvent("one"), makeEvent("two")] : [makeEvent("three"), makeEvent("four")];
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await syncPolymarketMarketCache(supabase.client as never, {
    mode: "all_open",
    pageSize: 2,
    maxPages: 10,
    maxMarkets: 3,
  });

  assert.deepEqual(offsets, ["0", "2"]);
  assert.equal(result.status, "success");
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.maxMarketsReached, true);
  assert.equal(result.marketsSeen, 3);
  const finished = supabase.state.finishedRuns[0] as { diagnostics?: Record<string, unknown> };
  assert.equal(finished.diagnostics?.privateTradingEndpointsUsed, false);
  assert.equal(finished.diagnostics?.fetchedVia, "public-gamma-events-paginated");
});

test("all mode combines open and archive records", async (t) => {
  const originalFetch = globalThis.fetch;
  const supabase = makeSupabase();

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    const closed = url.searchParams.get("closed") === "true";
    return new Response(JSON.stringify(closed ? [makeEvent("closed")] : [makeEvent("open")]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await syncPolymarketMarketCache(supabase.client as never, { mode: "all", pageSize: 5 });

  assert.equal(result.status, "success");
  assert.equal(result.marketsSeen, 2);
  assert.equal(supabase.state.upserts[0]?.length, 2);
});

test("archive failure in all mode produces partial result after open sync succeeds", async (t) => {
  const originalFetch = globalThis.fetch;
  const supabase = makeSupabase();

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get("closed") === "true") {
      return new Response(JSON.stringify({ error: "archive unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify([makeEvent("open")]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await syncPolymarketMarketCache(supabase.client as never, { mode: "all", pageSize: 5 });

  assert.equal(result.ok, true);
  assert.equal(result.status, "partial");
  assert.equal(result.marketsSeen, 1);
  assert.match(result.error ?? "", /503/);
  const finished = supabase.state.finishedRuns[0] as { status?: string; diagnostics?: Record<string, unknown> };
  assert.equal(finished.status, "partial");
  assert.equal(finished.diagnostics?.privateTradingEndpointsUsed, false);
  assert.equal(finished.diagnostics?.archiveClosedAttempted, true);
});
