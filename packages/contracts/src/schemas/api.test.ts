import test from "node:test";
import assert from "node:assert/strict";

import {
  CreateOrderRequestSchema,
  GetDepositsResponseSchema,
  GetMarketByIdResponseSchema,
  GetMarketsResponseSchema,
  GetMarketTradesResponseSchema,
  GetOrderBookResponseSchema,
  GetPortfolioResponseSchema,
  PostOrdersResponseSchema,
  VerifyDepositRequestSchema,
  VerifyDepositResponseSchema,
  apiOpenApiSource,
} from "../index";

const now = "2026-04-20T00:00:00.000Z";
const marketId = "11111111-1111-4111-8111-111111111111";
const outcomeId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";

const marketSnapshot = {
  id: marketId,
  slug: "will-it-rain",
  title: "Will it rain tomorrow?",
  description: "Daily weather market",
  status: "open",
  collateralCurrency: "USD",
  minPrice: "0",
  maxPrice: "100",
  tickSize: "1",
  createdAt: now,
  closesAt: null,
  resolvesAt: null,
  outcomes: [
    {
      id: outcomeId,
      marketId,
      slug: "yes",
      title: "Yes",
      index: 0,
      createdAt: now,
    },
  ],
  stats: {
    bestBid: "45",
    bestAsk: "46",
    lastTradePrice: null,
    volumeNotional: "1000",
  },
} as const;

test("market endpoints schemas parse expected wire payloads", () => {
  assert.doesNotThrow(() => GetMarketsResponseSchema.parse([marketSnapshot]));
  assert.doesNotThrow(() => GetMarketByIdResponseSchema.parse({ market: marketSnapshot }));
  assert.doesNotThrow(() =>
    GetOrderBookResponseSchema.parse({
      marketId,
      levels: [{ outcomeId, side: "buy", priceTicks: "45", quantityAtoms: "10" }],
    }),
  );
  assert.doesNotThrow(() =>
    GetMarketTradesResponseSchema.parse({
      marketId,
      trades: [{ id: orderId, outcomeId, priceTicks: "45", quantityAtoms: "3", takerSide: "sell", executedAt: now }],
    }),
  );
});

test("orders schemas parse expected wire payloads", () => {
  assert.doesNotThrow(() =>
    CreateOrderRequestSchema.parse({
      marketId,
      outcomeId,
      side: "buy",
      orderType: "limit",
      price: "50",
      quantity: "2",
      clientOrderId: "client-1",
    }),
  );

  assert.doesNotThrow(() =>
    PostOrdersResponseSchema.parse({
      order: {
        id: orderId,
        marketId,
        outcomeId,
        userId,
        side: "buy",
        orderType: "limit",
        status: "open",
        price: "50",
        quantity: "2",
        remainingQuantity: "2",
        reservedAmount: "100",
        clientOrderId: null,
        createdAt: now,
        updatedAt: now,
      },
      reserve: {
        journal: { id: "journal-1" },
        entryCount: 2,
        balanceDeltas: { "user:available": "-100", "user:reserved": "100" },
      },
      status: "open",
      trades: [],
    }),
  );
});

test("portfolio and deposit schemas parse expected wire payloads", () => {
  assert.doesNotThrow(() =>
    GetPortfolioResponseSchema.parse({
      balances: [{ currency: "USD", available: "1000", reserved: "50" }],
      openOrders: [],
      positions: [],
      claims: [],
      linkedWallet: null,
      deposits: [],
    }),
  );
  assert.doesNotThrow(() => VerifyDepositRequestSchema.parse({ txHash: "0xabc" }));
  assert.doesNotThrow(() =>
    VerifyDepositResponseSchema.parse({
      status: "accepted",
      deposit: {
        id: orderId,
        chain: "base",
        txHash: "0xabc",
        txSender: "0xsender",
        txRecipient: "0xrecipient",
        tokenAddress: "0xtoken",
        amount: "100",
        currency: "USDC",
        txStatus: "confirmed",
        blockNumber: "123",
        createdAt: now,
        verifiedAt: now,
      },
    }),
  );
  assert.doesNotThrow(() => GetDepositsResponseSchema.parse({ deposits: [] }));
});

test("openapi source only lists implemented HTTP routes", () => {
  const paths = Object.keys(apiOpenApiSource.paths);
  assert.deepEqual(paths.sort(), [
    "/deposits",
    "/deposits/verify",
    "/markets",
    "/markets/{marketId}",
    "/markets/{marketId}/orderbook",
    "/markets/{marketId}/trades",
    "/orders",
    "/orders/{orderId}",
    "/portfolio",
  ]);
});
