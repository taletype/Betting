import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchAllPolymarketGammaEventMarkets,
  fetchPolymarketGammaEventMarkets,
  fetchPolymarketGammaEventMarketsPage,
} from "./gamma";

const makeEvent = (id: string, overrides: Record<string, unknown> = {}) => ({
  id: `event-${id}`,
  slug: `event-${id}`,
  title: `Event ${id}`,
  question: `Event ${id}?`,
  active: true,
  closed: false,
  endDate: "2099-01-01T00:00:00.000Z",
  volume: "100",
  volume24hr: "10",
  markets: [
    {
      id,
      slug: `market-${id}`,
      question: `Market ${id}?`,
      active: true,
      closed: false,
      endDate: "2099-01-01T00:00:00.000Z",
      volume: "100",
      volume24hr: "10",
      outcomes: ["Yes", "No"],
      outcomePrices: ["0.4", "0.6"],
      clobTokenIds: [`yes-${id}`, `no-${id}`],
      ...overrides,
    },
  ],
});

test("fetchPolymarketGammaEventMarketsPage builds /events URL with limit and offset", async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify([makeEvent("one")]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const page = await fetchPolymarketGammaEventMarketsPage({ limit: 25, offset: 50, timeoutMs: 100 });
  const url = new URL(calls[0] ?? "");

  assert.equal(url.origin, "https://gamma-api.polymarket.com");
  assert.equal(url.pathname, "/events");
  assert.equal(url.searchParams.get("active"), "true");
  assert.equal(url.searchParams.get("closed"), "false");
  assert.equal(url.searchParams.get("order"), "volume_24hr");
  assert.equal(url.searchParams.get("ascending"), "false");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.get("offset"), "50");
  assert.equal(page.rawCount, 1);
  assert.equal(page.nextOffset, null);
  assert.equal(page.records[0]?.market.externalId, "one");
});

test("fetchAllPolymarketGammaEventMarkets fetches pages until a short page and preserves normalized records", async (t) => {
  const originalFetch = globalThis.fetch;
  const offsets: string[] = [];

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    offsets.push(url.searchParams.get("offset") ?? "");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const payload = offset === 0
      ? [makeEvent("one"), makeEvent("two")]
      : [makeEvent("three")];
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await fetchAllPolymarketGammaEventMarkets({ pageSize: 2, maxPages: 10, maxMarkets: 10 });

  assert.deepEqual(offsets, ["0", "2"]);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.rawRecordsSeen, 3);
  assert.equal(result.uniqueMarkets, 3);
  assert.equal(result.maxPagesReached, false);
  assert.equal(result.maxMarketsReached, false);
  assert.deepEqual(result.records.map((record) => record.market.externalId), ["one", "two", "three"]);
  assert.equal(result.records[0]?.market.outcomes[0]?.lastPrice, 0.4);
});

test("fetchAllPolymarketGammaEventMarkets de-duplicates by externalId", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const payload = offset === 0
      ? [makeEvent("same"), makeEvent("two")]
      : [makeEvent("same")];
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await fetchAllPolymarketGammaEventMarkets({ pageSize: 2, maxPages: 3 });

  assert.equal(result.rawRecordsSeen, 3);
  assert.equal(result.uniqueMarkets, 2);
  assert.deepEqual(result.records.map((record) => record.market.externalId), ["same", "two"]);
});

test("fetchAllPolymarketGammaEventMarkets respects maxPages", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify([makeEvent(`${calls}-a`), makeEvent(`${calls}-b`)]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await fetchAllPolymarketGammaEventMarkets({ pageSize: 2, maxPages: 1, maxMarkets: 10 });

  assert.equal(calls, 1);
  assert.equal(result.pagesFetched, 1);
  assert.equal(result.maxPagesReached, true);
  assert.equal(result.maxMarketsReached, false);
});

test("fetchAllPolymarketGammaEventMarkets respects maxMarkets", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify([makeEvent(`${calls}-a`), makeEvent(`${calls}-b`)]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await fetchAllPolymarketGammaEventMarkets({ pageSize: 2, maxPages: 10, maxMarkets: 3 });

  assert.equal(calls, 2);
  assert.equal(result.records.length, 3);
  assert.equal(result.maxMarketsReached, true);
});

test("fetchPolymarketGammaEventMarkets remains backward compatible", async (t) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(JSON.stringify([makeEvent("legacy")]), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const records = await fetchPolymarketGammaEventMarkets({ limit: 1 });
  assert.deepEqual(records.map((record) => record.market.externalId), ["legacy"]);
});

test("Gamma market sync helpers use public Gamma endpoints only", async () => {
  const { readFile } = await import("node:fs/promises");
  const file = await readFile(new URL("./gamma.ts", import.meta.url), "utf8");

  assert.match(file, /gamma-api\.polymarket\.com/);
  assert.doesNotMatch(file, /clob\.polymarket\.com/);
  assert.doesNotMatch(file, /\/auth|\/orders|\/order|private/i);
  assert.doesNotMatch(file, /cheerio|puppeteer|playwright|document\.querySelector|scrap/i);
});
