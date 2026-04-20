import assert from "node:assert/strict";
import test from "node:test";
import { serializeMarketSnapshot, serializeOrderBookResponse, serializeTradesResponse } from "./market-serializers";

test("serializes market snapshots with stable string/date fields", () => {
  const snapshot = serializeMarketSnapshot(
    {
      id: "11111111-1111-1111-1111-111111111111",
      slug: "market-1",
      title: "Will it rain?",
      description: "Rain in SF",
      status: "open",
      collateral_currency: "USDC",
      min_price: 1n,
      max_price: 99,
      tick_size: null,
      close_time: "2026-01-01T00:00:00.000Z",
      resolve_time: null,
      created_at: new Date("2025-12-31T00:00:00.000Z"),
    },
    [
      {
        id: "22222222-2222-2222-2222-222222222222",
        market_id: "11111111-1111-1111-1111-111111111111",
        slug: "yes",
        title: "Yes",
        outcome_index: 0,
        created_at: "2025-12-31T00:00:00.000Z",
      },
    ],
  );

  assert.equal(snapshot.minPrice, "1");
  assert.equal(snapshot.maxPrice, "99");
  assert.equal(snapshot.tickSize, "0");
  assert.equal(snapshot.createdAt, "2025-12-31T00:00:00.000Z");
  assert.equal(snapshot.closesAt, "2026-01-01T00:00:00.000Z");
  assert.equal(snapshot.outcomes[0]?.createdAt, "2025-12-31T00:00:00.000Z");
  assert.deepEqual(snapshot.stats, {
    bestBid: null,
    bestAsk: null,
    lastTradePrice: null,
    volumeNotional: "0",
  });
});

test("normalizes orderbook and trades RPC payload values", () => {
  const orderbook = serializeOrderBookResponse("fallback-market", {
    levels: [{ outcomeId: 12, side: "sell", priceTicks: 45n, quantityAtoms: 100 }],
  });
  assert.equal(orderbook.marketId, "fallback-market");
  assert.equal(orderbook.levels[0]?.outcomeId, "12");
  assert.equal(orderbook.levels[0]?.priceTicks, "45");
  assert.equal(orderbook.levels[0]?.quantityAtoms, "100");

  const trades = serializeTradesResponse("fallback-market", {
    trades: [
      {
        id: 5,
        outcomeId: 7,
        priceTicks: 45,
        quantityAtoms: 3n,
        takerSide: undefined,
        executedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ],
  });

  assert.equal(trades.marketId, "fallback-market");
  assert.equal(trades.trades[0]?.id, "5");
  assert.equal(trades.trades[0]?.outcomeId, "7");
  assert.equal(trades.trades[0]?.quantityAtoms, "3");
  assert.equal(trades.trades[0]?.takerSide, null);
  assert.equal(trades.trades[0]?.executedAt, "2026-01-02T00:00:00.000Z");
});
