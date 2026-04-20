import test from "node:test";
import assert from "node:assert/strict";

import {
  applyMarketRealtimeMessage,
  createMarketRealtimeState,
} from "./market-realtime";

test("applies snapshots and sequenced realtime events", () => {
  const baseState = createMarketRealtimeState(
    {
      marketId: "11111111-1111-1111-1111-111111111111",
      levels: [],
    },
    {
      marketId: "11111111-1111-1111-1111-111111111111",
      trades: [],
    },
  );

  const orderbookSnapshot = applyMarketRealtimeMessage(baseState, {
    type: "market.orderbook.snapshot",
    marketId: "11111111-1111-1111-1111-111111111111",
    orderbook: {
      marketId: "11111111-1111-1111-1111-111111111111",
      levels: [
        {
          outcomeId: "22222222-2222-2222-2222-222222222222",
          priceTicks: 60n,
          quantityAtoms: 10n,
          side: "buy",
        },
      ],
    },
    sequence: 4n,
  });

  assert.equal(orderbookSnapshot.shouldResync, false);
  assert.equal(orderbookSnapshot.nextState.lastSequence, 4n);
  assert.equal(orderbookSnapshot.nextState.orderBook.levels.length, 1);

  const tradeEvent = applyMarketRealtimeMessage(orderbookSnapshot.nextState, {
    type: "market.trade.executed",
    marketId: "11111111-1111-1111-1111-111111111111",
    sequence: 5n,
    trade: {
      executedAt: "2026-04-20T12:00:00.000Z",
      id: "33333333-3333-3333-3333-333333333333",
      outcomeId: "22222222-2222-2222-2222-222222222222",
      priceTicks: 60n,
      quantityAtoms: 3n,
      takerSide: "buy",
    },
  });

  assert.equal(tradeEvent.shouldResync, false);
  assert.equal(tradeEvent.nextState.lastSequence, 5n);
  assert.equal(tradeEvent.nextState.recentTrades.trades[0]?.id, "33333333-3333-3333-3333-333333333333");
});

test("requests resync on sequence gaps", () => {
  const state = {
    ...createMarketRealtimeState(
      {
        marketId: "11111111-1111-1111-1111-111111111111",
        levels: [],
      },
      {
        marketId: "11111111-1111-1111-1111-111111111111",
        trades: [],
      },
    ),
    lastSequence: 9n,
  };

  const result = applyMarketRealtimeMessage(state, {
    type: "market.orderbook.delta",
    marketId: "11111111-1111-1111-1111-111111111111",
    orderbook: {
      marketId: "11111111-1111-1111-1111-111111111111",
      levels: [],
    },
    sequence: 11n,
  });

  assert.equal(result.shouldResync, true);
  assert.equal(result.nextState.lastSequence, 9n);
});
