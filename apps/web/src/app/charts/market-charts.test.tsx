import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MarketSparkline,
  OrderBookDepthChart,
  PayoutStatusChart,
  PriceHistoryChart,
  RecentTradesChart,
  RewardSplitChart,
  VolumeHistoryChart,
} from "./market-charts";

test("chart components render valid data with accessible labels", () => {
  const markup = renderToStaticMarkup(
    <PriceHistoryChart points={[
      { timestamp: "2026-01-01T00:00:00.000Z", value: 0.42 },
      { timestamp: "2026-01-01T00:01:00.000Z", value: 0.45 },
    ]} />,
  );

  assert.match(markup, /aria-label="價格走勢"/);
  assert.match(markup, /polyline/);
});

test("chart components render loading, empty, and stale states", () => {
  assert.match(renderToStaticMarkup(<PriceHistoryChart loading />), /圖表載入中/);
  assert.match(renderToStaticMarkup(<PriceHistoryChart points={[]} />), /市場走勢資料暫時未能更新/);
  assert.match(renderToStaticMarkup(<VolumeHistoryChart points={[]} />), /成交資料暫時未有/);
  assert.match(renderToStaticMarkup(<OrderBookDepthChart points={[]} />), /訂單簿資料暫時未有/);
  assert.match(renderToStaticMarkup(<RecentTradesChart points={[]} stale />), /資料可能不是最新/);
});

test("chart components do not crash with missing or null data", () => {
  const markup = renderToStaticMarkup(
    <>
      <MarketSparkline points={null} />
      <PriceHistoryChart points={[{ timestamp: "bad", value: null }]} />
      <OrderBookDepthChart points={[{ side: "bid", price: null, size: null, cumulativeSize: null }]} />
      <RewardSplitChart points={null} />
      <PayoutStatusChart points={[]} />
    </>,
  );

  assert.match(markup, /暫時未有圖表資料/);
});

