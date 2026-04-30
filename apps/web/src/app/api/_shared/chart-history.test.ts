import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeOrderbookDepth,
  normalizePriceHistory,
  normalizeRecentTrades,
  normalizeVolumeHistory,
  shouldRenderSparkline,
} from "./chart-history";

test("normalizes valid priceHistory and sorts by timestamp", () => {
  const points = normalizePriceHistory({
    priceHistory: [
      { timestamp: "2026-01-01T00:02:00.000Z", outcome: "yes", price: "0.43", source: "cache" },
      { timestamp: "2026-01-01T00:01:00.000Z", outcome: "yes", price: 0.42, source: "data_api" },
    ],
  });

  assert.deepEqual(points.map((point) => point.timestamp), [
    "2026-01-01T00:01:00.000Z",
    "2026-01-01T00:02:00.000Z",
  ]);
  assert.equal(points[0]?.price, 0.42);
  assert.equal(points[1]?.source, "cache");
});

test("filters invalid/null price points without generating fake history", () => {
  const points = normalizePriceHistory({
    priceHistory: [
      null,
      { timestamp: "not-a-date", price: 0.41 },
      { timestamp: "2026-01-01T00:01:00.000Z", price: null },
      { timestamp: "2026-01-01T00:02:00.000Z", price: 2 },
      { timestamp: "2026-01-01T00:03:00.000Z", price: 0.44 },
    ],
  });

  assert.deepEqual(points, [{ timestamp: "2026-01-01T00:03:00.000Z", price: 0.44 }]);
  assert.equal(shouldRenderSparkline(points), false);
});

test("normalizes volume, orderbook depth, and recent trades only from real rows", () => {
  assert.deepEqual(normalizeVolumeHistory({
    volumeHistory: [
      { timestamp: "2026-01-01T00:01:00.000Z", volume: 10 },
      { timestamp: "2026-01-01T00:02:00.000Z", volume: -1 },
    ],
  }), [{ timestamp: "2026-01-01T00:01:00.000Z", volume: 10 }]);

  assert.deepEqual(normalizeOrderbookDepth({
    bids: [{ price: 0.4, size: 100 }, { price: 1.2, size: 10 }],
    asks: [{ price: "0.42", size: "75" }, { price: 0.5, size: -5 }],
    capturedAt: "2026-01-01T00:03:00.000Z",
    source: "clob",
  }), {
    bids: [{ price: 0.4, size: 100 }],
    asks: [{ price: 0.42, size: 75 }],
    updatedAt: "2026-01-01T00:03:00.000Z",
    source: "clob",
  });

  assert.deepEqual(normalizeRecentTrades({
    trades: [
      { executedAt: "2026-01-01T00:03:00.000Z", price: 0.45, size: 3, side: "buy", outcome: "yes" },
    ],
  }, "data_api"), [{
    timestamp: "2026-01-01T00:03:00.000Z",
    price: 0.45,
    size: 3,
    side: "buy",
    outcome: "yes",
    source: "data_api",
  }]);
});
