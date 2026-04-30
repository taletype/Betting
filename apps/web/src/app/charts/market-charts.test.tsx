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
  hasChartData,
  normalizeChartPoints,
  shouldRenderSparkline,
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
  assert.match(renderToStaticMarkup(<PriceHistoryChart points={[]} />), /暫時未有價格歷史。市場資料會在同步後顯示。/);
  assert.match(renderToStaticMarkup(<VolumeHistoryChart points={[]} />), /暫時未有成交資料/);
  assert.match(renderToStaticMarkup(<OrderBookDepthChart points={[]} />), /暫時未有買賣盤資料/);
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

test("chart guards filter invalid points and only render sparklines with two valid points", () => {
  const points = [
    { timestamp: "bad-null", value: null },
    { timestamp: "bad-nan", value: Number.NaN },
    { timestamp: "2026-01-01T00:00:00.000Z", value: 0.41 },
    { timestamp: "2026-01-01T00:01:00.000Z", value: 0.42 },
  ];

  assert.equal(hasChartData([]), false);
  assert.equal(hasChartData([{ timestamp: "2026-01-01T00:00:00.000Z", value: 0.41 }]), true);
  assert.equal(shouldRenderSparkline([]), false);
  assert.equal(shouldRenderSparkline([{ timestamp: "2026-01-01T00:00:00.000Z", value: 0.41 }]), false);
  assert.equal(shouldRenderSparkline(points), true);
  assert.deepEqual(normalizeChartPoints(points).map((point) => point.timestamp), ["2026-01-01T00:00:00.000Z", "2026-01-01T00:01:00.000Z"]);

  assert.equal(renderToStaticMarkup(<MarketSparkline points={[]} hideWhenEmpty />), "");
  assert.equal(renderToStaticMarkup(<MarketSparkline points={[{ timestamp: "2026-01-01T00:00:00.000Z", value: 0.41 }]} hideWhenEmpty />), "");
  assert.match(renderToStaticMarkup(<MarketSparkline points={points} hideWhenEmpty />), /<svg class="line-chart"/);
});
