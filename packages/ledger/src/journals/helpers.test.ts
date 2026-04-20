import test from "node:test";
import assert from "node:assert/strict";

import {
  assertBalancedJournalEntries,
  releaseOrderReserve,
  reserveForOrder,
  settleMatchedTrade,
} from "../index";

test("reserveForOrder builds a balanced reserve journal", () => {
  const result = reserveForOrder({
    journalId: "journal-reserve-1",
    createdAt: "2026-04-20T00:00:00.000Z",
    reference: "order:ord_1:reserve",
    orderId: "ord_1",
    userId: "user_1",
    currency: "USD",
    amount: 500n,
  });

  assert.equal(result.journal.kind, "order_reserve");
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.balanceDeltas, [
    { accountCode: "user:user_1:funds:available", currency: "USD", delta: -500n },
    { accountCode: "user:user_1:funds:reserved", currency: "USD", delta: 500n },
  ]);
});

test("releaseOrderReserve builds a balanced release journal", () => {
  const result = releaseOrderReserve({
    journalId: "journal-release-1",
    createdAt: "2026-04-20T00:00:00.000Z",
    reference: "order:ord_1:release",
    orderId: "ord_1",
    userId: "user_1",
    currency: "USD",
    amount: 500n,
    remainingReservedAmount: 500n,
  });

  assert.equal(result.journal.kind, "order_release");
  assert.deepEqual(result.balanceDeltas, [
    { accountCode: "user:user_1:funds:available", currency: "USD", delta: 500n },
    { accountCode: "user:user_1:funds:reserved", currency: "USD", delta: -500n },
  ]);
});

test("releaseOrderReserve rejects release above reserved amount", () => {
  assert.throws(
    () =>
      releaseOrderReserve({
        journalId: "journal-release-2",
        createdAt: "2026-04-20T00:00:00.000Z",
        reference: "order:ord_1:release",
        orderId: "ord_1",
        userId: "user_1",
        currency: "USD",
        amount: 501n,
        remainingReservedAmount: 500n,
      }),
    /remaining reserved amount/,
  );
});

test("reserveForOrder rejects negative amount", () => {
  assert.throws(
    () =>
      reserveForOrder({
        journalId: "journal-reserve-2",
        createdAt: "2026-04-20T00:00:00.000Z",
        reference: "order:ord_2:reserve",
        orderId: "ord_2",
        userId: "user_2",
        currency: "USD",
        amount: -1n,
      }),
    /non-negative/,
  );
});

test("assertBalancedJournalEntries rejects an unbalanced journal", () => {
  assert.throws(
    () =>
      assertBalancedJournalEntries([
        {
          id: "bad:1",
          journalId: "bad",
          accountCode: "user:user_1:funds:available",
          direction: "debit",
          amount: 10n,
          currency: "USD",
        },
        {
          id: "bad:2",
          journalId: "bad",
          accountCode: "user:user_1:funds:reserved",
          direction: "credit",
          amount: 9n,
          currency: "USD",
        },
      ]),
    /must balance/,
  );
});

test("settleMatchedTrade builds a balanced settlement journal with buy-side price improvement release", () => {
  const result = settleMatchedTrade({
    journalId: "journal-settle-1",
    createdAt: "2026-04-20T00:00:00.000Z",
    reference: "trade:trd_1:settle",
    tradeId: "trd_1",
    outcomeId: "out_1",
    currency: "USD",
    price: 40n,
    quantity: 5n,
    buyer: {
      orderId: "ord_buy",
      userId: "user_buy",
      orderPrice: 50n,
    },
    seller: {
      orderId: "ord_sell",
      userId: "user_sell",
    },
  });

  assert.equal(result.journal.kind, "settle");
  assert.equal(result.entries.length, 6);
  assert.deepEqual(result.balanceDeltas, [
    { accountCode: "user:user_buy:position:out_1:long", currency: "USD", delta: 200n },
    { accountCode: "user:user_buy:funds:reserved", currency: "USD", delta: -200n },
    { accountCode: "user:user_sell:position:out_1:short", currency: "USD", delta: 200n },
    { accountCode: "user:user_sell:funds:reserved", currency: "USD", delta: -200n },
    { accountCode: "user:user_buy:funds:available", currency: "USD", delta: 50n },
    { accountCode: "user:user_buy:funds:reserved", currency: "USD", delta: -50n },
  ]);
});

test("settleMatchedTrade omits price-improvement release when buyer limit equals trade price", () => {
  const result = settleMatchedTrade({
    journalId: "journal-settle-2",
    createdAt: "2026-04-20T00:00:00.000Z",
    reference: "trade:trd_2:settle",
    tradeId: "trd_2",
    outcomeId: "out_1",
    currency: "USD",
    price: 50n,
    quantity: 5n,
    buyer: {
      orderId: "ord_buy",
      userId: "user_buy",
      orderPrice: 50n,
    },
    seller: {
      orderId: "ord_sell",
      userId: "user_sell",
    },
  });

  assert.equal(result.entries.length, 4);
});
