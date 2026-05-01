import assert from "node:assert/strict";
import test from "node:test";

import { readExternalMarketsFromCache } from "./external-market-cache";

const makeCacheRow = (overrides: Record<string, unknown> = {}) => ({
  id: overrides.id ?? "row-open",
  source: "polymarket",
  external_id: overrides.external_id ?? "OPEN-1",
  slug: overrides.slug ?? "open-1",
  title: overrides.title ?? "Open market",
  description: overrides.description ?? "",
  category: null,
  outcomes: overrides.outcomes ?? [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", outcomeIndex: 0, yesNo: "yes", lastPrice: 0.5 }],
  prices: overrides.prices ?? {},
  best_bid: overrides.best_bid === undefined ? 0.49 : overrides.best_bid,
  best_ask: overrides.best_ask === undefined ? 0.51 : overrides.best_ask,
  volume: overrides.volume === undefined ? 100 : overrides.volume,
  liquidity: overrides.liquidity === undefined ? 100 : overrides.liquidity,
  close_time: overrides.close_time ?? "2099-01-01T00:00:00.000Z",
  resolution_status: overrides.resolution_status ?? "open",
  polymarket_url: "https://polymarket.com/event/open-1",
  image_url: overrides.image_url ?? null,
  icon_url: null,
  image_source_url: null,
  image_updated_at: null,
  raw_json: {},
  source_provenance: overrides.source_provenance ?? {},
  first_seen_at: "2026-04-30T00:00:00.000Z",
  last_seen_at: "2026-04-30T00:00:00.000Z",
  last_synced_at: overrides.last_synced_at ?? "2026-04-30T00:00:00.000Z",
  stale_after: overrides.stale_after ?? "2099-01-01T00:00:00.000Z",
  is_active: overrides.is_active ?? true,
  is_tradable: overrides.is_tradable ?? true,
  created_at: overrides.created_at ?? "2026-04-30T00:00:00.000Z",
  updated_at: overrides.updated_at ?? "2026-04-30T00:00:00.000Z",
});

const makeSupabase = (rows: ReturnType<typeof makeCacheRow>[]) => ({
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

    if (table === "external_markets") {
      return {
        select: () => ({
          eq: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        }),
      };
    }

    if (table === "external_market_prices") {
      return {
        select: () => ({
          in: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      };
    }

    throw new Error(`unexpected table ${table}`);
  },
});

test("smart mode filters low-quality markets", async () => {
  const result = await readExternalMarketsFromCache(makeSupabase([
    makeCacheRow({ id: "active", external_id: "ACTIVE", title: "Active priced market" }),
    makeCacheRow({ id: "no-price", external_id: "NO-PRICE", title: "No price market", best_bid: null, best_ask: null, outcomes: [] }),
    makeCacheRow({ id: "low-volume", external_id: "LOW", title: "Low volume market", volume: 0, liquidity: 0 }),
  ]) as never, { view: "smart" });

  assert.deepEqual(result.markets.map((market) => market.externalId), ["ACTIVE"]);
  assert.equal(result.pagination.totalCount, 1);
});

test("all mode returns low-quality and stale markets", async () => {
  const result = await readExternalMarketsFromCache(makeSupabase([
    makeCacheRow({ id: "active", external_id: "ACTIVE", title: "Active priced market" }),
    makeCacheRow({ id: "no-price", external_id: "NO-PRICE", title: "No price market", best_bid: null, best_ask: null, outcomes: [], volume: 0, liquidity: 0 }),
    makeCacheRow({ id: "stale", external_id: "STALE", title: "Stale market", stale_after: "2000-01-01T00:00:00.000Z" }),
  ]) as never, { view: "all", status: "all", sort: "latest" });

  assert.deepEqual(new Set(result.markets.map((market) => market.externalId)), new Set(["ACTIVE", "NO-PRICE", "STALE"]));
  assert.equal(result.stale, true);
  assert.equal(result.pagination.totalCount, 3);
});

test("status all and precise status filters include non-open rows", async () => {
  const rows = [
    makeCacheRow({ id: "open", external_id: "OPEN", title: "Open market" }),
    makeCacheRow({ id: "closed", external_id: "CLOSED", title: "Closed market", resolution_status: "closed", is_active: false }),
    makeCacheRow({ id: "resolved", external_id: "RESOLVED", title: "Resolved market", resolution_status: "resolved", is_active: false }),
    makeCacheRow({ id: "cancelled", external_id: "CANCELLED", title: "Cancelled market", resolution_status: "cancelled", is_active: false }),
  ];

  const all = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "all", status: "all" });
  assert.deepEqual(new Set(all.markets.map((market) => market.status)), new Set(["open", "closed", "resolved", "cancelled"]));

  const resolved = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "all", status: "resolved" });
  assert.deepEqual(resolved.markets.map((market) => market.externalId), ["RESOLVED"]);

  const closed = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "all", status: "closed" });
  assert.deepEqual(new Set(closed.markets.map((market) => market.externalId)), new Set(["CLOSED", "RESOLVED", "CANCELLED"]));
});

test("q filters by title, slug, and external id", async () => {
  const rows = [
    makeCacheRow({ external_id: "MATCH-ID", slug: "alpha-market", title: "First market" }),
    makeCacheRow({ external_id: "OTHER", slug: "beta-market", title: "Second market" }),
  ];

  const bySlug = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "all", status: "all", q: "beta" });
  assert.deepEqual(bySlug.markets.map((market) => market.externalId), ["OTHER"]);

  const byId = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "all", status: "all", q: "match-id" });
  assert.deepEqual(byId.markets.map((market) => market.externalId), ["MATCH-ID"]);
});

test("limit, offset, max limit, and sorting are stable", async () => {
  const rows = [
    makeCacheRow({ external_id: "LOW", title: "Low volume", volume: 1, liquidity: 1 }),
    makeCacheRow({ external_id: "MID", title: "Mid volume", volume: 10, liquidity: 10 }),
    makeCacheRow({ external_id: "HIGH", title: "High volume", volume: 100, liquidity: 100 }),
  ];

  const first = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "all", status: "all", sort: "volume", limit: 2 });
  assert.deepEqual(first.markets.map((market) => market.externalId), ["HIGH", "MID"]);
  assert.equal(first.pagination.nextOffset, 2);

  const second = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "all", status: "all", sort: "volume", limit: 2, offset: 2 });
  assert.deepEqual(second.markets.map((market) => market.externalId), ["LOW"]);
  assert.equal(second.pagination.nextOffset, null);

  const capped = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "all", status: "all", limit: 999 });
  assert.equal(capped.pagination.limit, 250);
  assert.equal(capped.pagination.totalCount, 3);
  assert.equal(capped.pagination.nextOffset, null);
});

test("offset is applied after filtering and final page has no nextOffset", async () => {
  const rows = [
    makeCacheRow({ external_id: "HIDDEN", title: "Hidden stale", stale_after: "2000-01-01T00:00:00.000Z" }),
    makeCacheRow({ external_id: "FIRST", title: "Visible first", volume: 100 }),
    makeCacheRow({ external_id: "SECOND", title: "Visible second", volume: 90 }),
  ];

  const result = await readExternalMarketsFromCache(makeSupabase(rows) as never, {
    view: "smart",
    status: "open",
    sort: "volume",
    limit: 1,
    offset: 1,
  });

  assert.deepEqual(result.markets.map((market) => market.externalId), ["SECOND"]);
  assert.equal(result.pagination.totalCount, 2);
  assert.equal(result.pagination.nextOffset, null);
});

test("view all keeps no-price and stale rows while smart hides them", async () => {
  const rows = [
    makeCacheRow({ external_id: "GOOD", title: "Good market" }),
    makeCacheRow({ external_id: "NO_PRICE", title: "No price", best_bid: null, best_ask: null, outcomes: [] }),
    makeCacheRow({ external_id: "STALE", title: "Stale market", stale_after: "2000-01-01T00:00:00.000Z" }),
  ];

  const all = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "all", status: "all", sort: "latest" });
  const smart = await readExternalMarketsFromCache(makeSupabase(rows) as never, { view: "smart", status: "open", sort: "latest" });

  assert.deepEqual(new Set(all.markets.map((market) => market.externalId)), new Set(["GOOD", "NO_PRICE", "STALE"]));
  assert.deepEqual(smart.markets.map((market) => market.externalId), ["GOOD"]);
});
