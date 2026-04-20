import test from "node:test";
import assert from "node:assert/strict";

import { matchLimitOrder, type MatchableOrder } from "./index";

const buildOrder = (overrides: Partial<MatchableOrder> = {}): MatchableOrder => ({
  id: overrides.id ?? crypto.randomUUID(),
  marketId: overrides.marketId ?? "11111111-1111-4111-8111-111111111111",
  outcomeId: overrides.outcomeId ?? "22222222-2222-4222-8222-222222222222",
  userId: overrides.userId ?? "00000000-0000-4000-8000-000000000001",
  side: overrides.side ?? "buy",
  price: overrides.price ?? 50n,
  remainingQuantity: overrides.remainingQuantity ?? 10n,
  createdAt: overrides.createdAt ?? "2026-04-20T00:00:00.000Z",
});

test("price priority prefers better resting price first", () => {
  const incomingOrder = buildOrder({ id: "incoming", side: "buy", price: 60n, remainingQuantity: 5n });
  const result = matchLimitOrder(incomingOrder, [
    buildOrder({ id: "sell-worse", side: "sell", price: 55n, remainingQuantity: 5n }),
    buildOrder({ id: "sell-better", side: "sell", price: 45n, remainingQuantity: 5n }),
  ]);

  assert.deepEqual(
    result.fills.map((fill) => fill.restingOrderId),
    ["sell-better"],
  );
});

test("time priority breaks ties at the same price", () => {
  const incomingOrder = buildOrder({ id: "incoming", side: "buy", price: 60n, remainingQuantity: 6n });
  const result = matchLimitOrder(incomingOrder, [
    buildOrder({
      id: "later",
      side: "sell",
      price: 50n,
      remainingQuantity: 3n,
      createdAt: "2026-04-20T00:01:00.000Z",
    }),
    buildOrder({
      id: "earlier",
      side: "sell",
      price: 50n,
      remainingQuantity: 3n,
      createdAt: "2026-04-20T00:00:00.000Z",
    }),
  ]);

  assert.deepEqual(
    result.fills.map((fill) => fill.restingOrderId),
    ["earlier", "later"],
  );
});

test("partial fill leaves remaining quantity on the incoming order", () => {
  const incomingOrder = buildOrder({ id: "incoming", side: "buy", price: 60n, remainingQuantity: 10n });
  const result = matchLimitOrder(incomingOrder, [
    buildOrder({ id: "sell-1", side: "sell", price: 50n, remainingQuantity: 4n }),
  ]);

  assert.equal(result.incomingRemainingQuantity, 6n);
  assert.equal(result.restingRemainingQuantities["sell-1"], 0n);
});

test("full fill consumes the incoming order across multiple resting orders", () => {
  const incomingOrder = buildOrder({ id: "incoming", side: "buy", price: 60n, remainingQuantity: 10n });
  const result = matchLimitOrder(incomingOrder, [
    buildOrder({ id: "sell-1", side: "sell", price: 45n, remainingQuantity: 3n }),
    buildOrder({ id: "sell-2", side: "sell", price: 50n, remainingQuantity: 7n }),
  ]);

  assert.equal(result.incomingRemainingQuantity, 0n);
  assert.equal(result.fills.length, 2);
  assert.equal(result.restingRemainingQuantities["sell-1"], 0n);
  assert.equal(result.restingRemainingQuantities["sell-2"], 0n);
});

test("no match occurs when prices do not cross", () => {
  const incomingOrder = buildOrder({ id: "incoming", side: "buy", price: 40n, remainingQuantity: 5n });
  const result = matchLimitOrder(incomingOrder, [
    buildOrder({ id: "sell-1", side: "sell", price: 45n, remainingQuantity: 5n }),
  ]);

  assert.equal(result.fills.length, 0);
  assert.equal(result.incomingRemainingQuantity, 5n);
});

test("no cross-market or cross-outcome matching occurs", () => {
  const incomingOrder = buildOrder({ id: "incoming", side: "buy", price: 60n, remainingQuantity: 5n });
  const result = matchLimitOrder(incomingOrder, [
    buildOrder({
      id: "other-market",
      side: "sell",
      marketId: "44444444-4444-4444-8444-444444444444",
      price: 40n,
    }),
    buildOrder({
      id: "other-outcome",
      side: "sell",
      outcomeId: "33333333-3333-4333-8333-333333333333",
      price: 40n,
    }),
  ]);

  assert.equal(result.fills.length, 0);
});

test("deterministic output is stable for the same input sequence", () => {
  const incomingOrder = buildOrder({ id: "incoming", side: "sell", price: 45n, remainingQuantity: 8n });
  const candidateOrders = [
    buildOrder({
      id: "buy-2",
      side: "buy",
      price: 55n,
      remainingQuantity: 3n,
      createdAt: "2026-04-20T00:01:00.000Z",
    }),
    buildOrder({
      id: "buy-1",
      side: "buy",
      price: 55n,
      remainingQuantity: 5n,
      createdAt: "2026-04-20T00:00:00.000Z",
    }),
  ];

  const first = matchLimitOrder(incomingOrder, candidateOrders);
  const second = matchLimitOrder(incomingOrder, candidateOrders);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.fills.map((fill) => ({ restingOrderId: fill.restingOrderId, quantity: fill.quantity, price: fill.price })),
    [
      { restingOrderId: "buy-1", quantity: 5n, price: 45n },
      { restingOrderId: "buy-2", quantity: 3n, price: 45n },
    ],
  );
});
