import test from "node:test";
import assert from "node:assert/strict";

import {
  AdminExecuteWithdrawalRequestSchema,
  AdminFailWithdrawalRequestSchema,
  AdminResolveMarketRequestSchema,
  AdminResolveMarketResponseSchema,
  AdminWithdrawalActionResponseSchema,
  ApiErrorResponseSchema,
  ApiHealthResponseSchema,
  ApiReadyResponseSchema,
  CreateOrderRequestSchema,
  CreateWithdrawalRequestSchema,
  DeleteOrderResponseSchema,
  GetClaimStateByMarketResponseSchema,
  GetClaimsResponseSchema,
  GetDepositsResponseSchema,
  GetExternalMarketBySourceAndIdResponseSchema,
  GetExternalMarketTradesBySourceAndIdResponseSchema,
  GetExternalMarketsResponseSchema,
  GetMarketByIdResponseSchema,
  GetMarketsResponseSchema,
  GetMarketTradesResponseSchema,
  GetOrderBookResponseSchema,
  GetPortfolioResponseSchema,
  GetWithdrawalsResponseSchema,
  PostClaimByMarketResponseSchema,
  PostOrdersResponseSchema,
  PostWithdrawalsResponseSchema,
  VerifyDepositRequestSchema,
  VerifyDepositResponseSchema,
  apiOpenApiSource,
} from "../index";

const now = "2026-04-20T00:00:00.000Z";
const marketId = "11111111-1111-4111-8111-111111111111";
const outcomeId = "22222222-2222-4222-8222-222222222222";
const orderId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const claimId = "55555555-5555-4555-8555-555555555555";
const resolutionId = "66666666-6666-4666-8666-666666666666";
const withdrawalId = "77777777-7777-4777-8777-777777777777";

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

test("health and readiness schemas parse expected payloads", () => {
  assert.doesNotThrow(() => ApiHealthResponseSchema.parse({ ok: true, service: "api", checkedAt: now }));
  assert.doesNotThrow(() => ApiReadyResponseSchema.parse({ ok: true, service: "api", ready: true, checkedAt: now }));
  assert.doesNotThrow(() => ApiErrorResponseSchema.parse({ error: "nope" }));
});

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

  const orderResponse = {
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
  };

  assert.doesNotThrow(() => PostOrdersResponseSchema.parse(orderResponse));
  assert.doesNotThrow(() => DeleteOrderResponseSchema.parse({ ...orderResponse, release: orderResponse.reserve, status: "cancelled" }));
});

test("portfolio, claims, deposits, and withdrawals schemas parse expected wire payloads", () => {
  assert.doesNotThrow(() =>
    GetPortfolioResponseSchema.parse({
      balances: [{ currency: "USD", available: "1000", reserved: "50" }],
      openOrders: [],
      positions: [],
      claims: [],
      linkedWallet: null,
      deposits: [],
      withdrawals: [],
    }),
  );

  const claim = {
    id: claimId,
    userId,
    marketId,
    resolutionId,
    claimableAmount: "100",
    claimedAmount: "100",
    status: "claimed",
    createdAt: now,
    updatedAt: now,
  };

  assert.doesNotThrow(() => GetClaimsResponseSchema.parse({ claims: [claim], states: [] }));
  assert.doesNotThrow(() =>
    GetClaimStateByMarketResponseSchema.parse({
      marketId,
      resolutionId,
      claimableAmount: "0",
      claimedAmount: "100",
      status: "claimed",
    }),
  );
  assert.doesNotThrow(() => PostClaimByMarketResponseSchema.parse({ claim, payoutJournalId: resolutionId }));

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

  assert.doesNotThrow(() => CreateWithdrawalRequestSchema.parse({ amountAtoms: "1", destinationAddress: "0xabc" }));
  const withdrawal = {
    id: withdrawalId,
    amountAtoms: "100",
    destinationAddress: "0xabc",
    status: "requested",
    requestedAt: now,
    processedAt: null,
    txHash: null,
  };
  assert.doesNotThrow(() => GetWithdrawalsResponseSchema.parse({ withdrawals: [withdrawal] }));
  assert.doesNotThrow(() => PostWithdrawalsResponseSchema.parse(withdrawal));
  assert.doesNotThrow(() => AdminWithdrawalActionResponseSchema.parse(withdrawal));
});

test("admin and external market schemas parse expected wire payloads", () => {
  assert.doesNotThrow(() =>
    AdminResolveMarketRequestSchema.parse({
      winningOutcomeId: outcomeId,
      evidenceText: "oracle settlement",
      evidenceUrl: "https://example.com/evidence",
      resolverId: "resolver-1",
    }),
  );
  assert.doesNotThrow(() =>
    AdminResolveMarketResponseSchema.parse({
      marketId,
      status: "resolved",
      resolution: {
        id: resolutionId,
        marketId,
        status: "finalized",
        winningOutcomeId: outcomeId,
        resolvedAt: now,
        evidenceUrl: "https://example.com/evidence",
        notes: "resolved",
      },
    }),
  );
  assert.doesNotThrow(() => AdminExecuteWithdrawalRequestSchema.parse({ txHash: "0xhash" }));
  assert.doesNotThrow(() => AdminFailWithdrawalRequestSchema.parse({ reason: "tx reverted" }));

  const externalMarket = {
    id: marketId,
    source: "polymarket",
    externalId: "pm-1",
    slug: "external-market",
    title: "External market",
    description: "desc",
    status: "open",
    marketUrl: "https://example.com/market",
    closeTime: null,
    endTime: null,
    resolvedAt: null,
    bestBid: 0.42,
    bestAsk: 0.43,
    lastTradePrice: 0.42,
    volume24h: 1200,
    volumeTotal: 8000,
    lastSyncedAt: now,
    createdAt: now,
    updatedAt: now,
    outcomes: [],
    recentTrades: [],
  };

  assert.doesNotThrow(() => GetExternalMarketsResponseSchema.parse([externalMarket]));
  assert.doesNotThrow(() => GetExternalMarketBySourceAndIdResponseSchema.parse({ market: externalMarket }));
  assert.doesNotThrow(() =>
    GetExternalMarketTradesBySourceAndIdResponseSchema.parse({
      source: "polymarket",
      externalId: "pm-1",
      trades: [
        {
          externalTradeId: "trade-1",
          externalOutcomeId: "yes",
          source: "polymarket",
          side: "buy",
          price: 0.42,
          pricePpm: "420000",
          size: 5,
          sizeAtoms: "5000000",
          executedAt: now,
        },
      ],
    }),
  );
});

test("openapi source only lists implemented HTTP routes", () => {
  const paths = Object.keys(apiOpenApiSource.paths);
  assert.deepEqual(paths.sort(), [
    "/admin/markets/{marketId}/resolve",
    "/admin/withdrawals/{withdrawalId}/execute",
    "/admin/withdrawals/{withdrawalId}/fail",
    "/claims",
    "/claims/{marketId}",
    "/claims/{marketId}/state",
    "/deposits",
    "/deposits/verify",
    "/external/markets",
    "/external/markets/{source}/{externalId}",
    "/external/markets/{source}/{externalId}/orderbook",
    "/external/markets/{source}/{externalId}/trades",
    "/health",
    "/markets",
    "/markets/{marketId}",
    "/markets/{marketId}/orderbook",
    "/markets/{marketId}/trades",
    "/orders",
    "/orders/{orderId}",
    "/portfolio",
    "/ready",
    "/withdrawals",
  ]);
});
