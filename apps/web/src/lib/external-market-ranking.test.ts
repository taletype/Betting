import assert from "node:assert/strict";
import test from "node:test";

import type { ExternalMarketApiRecord } from "./api";
import { getMarketQualityScore } from "./external-market-ranking";

const makeMarket = (overrides: Partial<ExternalMarketApiRecord> = {}): ExternalMarketApiRecord => ({
  id: "m1",
  source: "polymarket",
  externalId: "POLY-1",
  slug: "poly-1",
  title: "Will the market be useful?",
  description: "",
  status: "open",
  marketUrl: null,
  imageUrl: "https://example.com/market.png",
  iconUrl: null,
  imageSourceUrl: null,
  imageUpdatedAt: null,
  closeTime: "2099-01-01T00:00:00.000Z",
  endTime: "2099-01-01T00:00:00.000Z",
  resolvedAt: null,
  bestBid: 0.4,
  bestAsk: 0.42,
  lastTradePrice: 0.41,
  volume24h: 100,
  volumeTotal: 1000,
  liquidity: 500,
  sourceProvenance: { stale: false, staleAfter: "2099-01-01T00:00:00.000Z" },
  lastSyncedAt: "2026-05-01T00:00:00.000Z",
  lastUpdatedAt: "2026-05-01T00:00:00.000Z",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
  outcomes: [
    { externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: 0.4, bestAsk: 0.42, lastPrice: 0.41, volume: null },
    { externalOutcomeId: "no", title: "No", slug: "no", index: 1, yesNo: "no", bestBid: 0.58, bestAsk: 0.6, lastPrice: 0.59, volume: null },
  ],
  recentTrades: [],
  latestOrderbook: [],
  ...overrides,
});

test("open priced liquid market scores above closed no-price market", () => {
  const open = makeMarket();
  const closed = makeMarket({
    status: "closed",
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    volume24h: 0,
    volumeTotal: 0,
    liquidity: 0,
    closeTime: "2000-01-01T00:00:00.000Z",
    outcomes: [],
  });

  assert.ok(getMarketQualityScore(open) > getMarketQualityScore(closed));
});

test("stale market is penalized", () => {
  const fresh = makeMarket();
  const stale = makeMarket({
    sourceProvenance: { stale: true, staleAfter: "2000-01-01T00:00:00.000Z" },
    lastUpdatedAt: "2000-01-01T00:00:00.000Z",
  });

  assert.ok(getMarketQualityScore(fresh) > getMarketQualityScore(stale));
});

test("no-price and missing-field markets still return stable numeric scores", () => {
  const score = getMarketQualityScore(makeMarket({
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    imageUrl: null,
    iconUrl: null,
    closeTime: null,
    endTime: null,
    volume24h: null,
    volumeTotal: null,
    liquidity: null,
    outcomes: [{ externalOutcomeId: "yes", title: "Yes", slug: "yes", index: 0, yesNo: "yes", bestBid: null, bestAsk: null, lastPrice: null, volume: null }],
  }));

  assert.equal(typeof score, "number");
  assert.ok(Number.isFinite(score));
});
