import type {
  Order,
  OrderSubmittedForMatchingCommand,
  PortfolioBalance,
  Position,
  RecentTrade,
} from "@bet/contracts";
import {
  PUBLIC_MARKET_EVENTS_NOTIFICATION_CHANNEL,
  PrivateBalanceUpdatedEventSchema,
  PrivateOrderUpdatedEventSchema,
  PrivatePositionUpdatedEventSchema,
  PublicOrderBookChangedNotificationSchema,
  PublicTradeExecutedNotificationSchema,
} from "@bet/contracts";
import { createDatabaseClient, type DatabaseClient } from "@bet/db";
import {
  assertOrderCanCancel,
  assertOrderCanReserve,
  assertValidLimitOrderInputs,
  multiplyPriceTicks,
  priceTicks,
  quantityAtoms,
  reservedAmountAtoms,
} from "@bet/domain";
import {
  releaseOrderReserve,
  reserveForOrder,
  settleMatchedTrade,
  type LedgerMutationResult,
} from "@bet/ledger";
import { matchLimitOrder, type MatchFill } from "@bet/matching";
import { logger } from "@bet/observability";

import {
  allocatePublicMarketSequences,
  getBalanceSnapshot,
  getMarketSelection,
  getNextTradeSequence,
  getOrderForUpdate,
  getPositionForUpdate,
  insertLedgerMutation,
  insertOrder,
  insertTrade,
  listMatchableRestingOrders,
  lockTradeSequenceForMarket,
  markOrderMatchingProcessed,
  type PositionState,
  type StoredOrder,
  type TradeInsertInput,
  updateCancelledOrder,
  updateOrder,
  upsertPosition,
} from "./repository";
import { createSubmittedOrderMatchingQueue, type SubmittedOrderMatchingQueue } from "./queue";
import {
  createRealtimePublisher,
  PRIVATE_USER_CHANNEL_PREFIX,
  type RealtimePublisher,
  type RealtimePublication,
} from "./realtime";

const DEFAULT_COLLATERAL_CURRENCY = "USD";
const DEMO_USER_ID = "99999999-9999-4999-8999-999999999999";

export interface CreateOrderInput {
  userId?: string;
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  orderType: "limit" | "market";
  price: bigint;
  quantity: bigint;
  clientOrderId?: string | null;
}

export interface CancelOrderInput {
  orderId: string;
}

export interface OrderJournalSummary {
  journal: LedgerMutationResult["journal"];
  entryCount: number;
  balanceDeltas: LedgerMutationResult["balanceDeltas"];
}

export interface TradeSummary {
  id: string;
  makerOrderId: string;
  takerOrderId: string;
  price: bigint;
  quantity: bigint;
  notional: bigint;
  sequence: bigint;
  matchedAt: string;
}

export interface CreateOrderResult {
  order: Order;
  reserve: OrderJournalSummary;
  status: Order["status"];
  trades: TradeSummary[];
}

export interface CancelOrderResult {
  order: Order;
  release: OrderJournalSummary;
  status: "cancelled";
}

interface MatchingPostCommitState {
  marketId: string;
  outcomeId: string;
  incomingSide: Order["side"];
  privateSequenceBase: bigint;
  publicOrderbookSequence: bigint;
  publicTradeSequences: bigint[];
  trades: TradeInsertInput[];
  orders: Order[];
  positions: Position[];
  balanceUsers: string[];
  collateralCurrency: string;
}

interface MatchingTransactionResult {
  order: Order | null;
  skippedReason: "already_processed" | "not_found" | "terminal_before_match" | null;
  postCommit: MatchingPostCommitState | null;
}

const buildJournalSummary = (mutation: LedgerMutationResult): OrderJournalSummary => ({
  journal: mutation.journal,
  entryCount: mutation.entries.length,
  balanceDeltas: mutation.balanceDeltas,
});

const calculateRequiredReserveAmount = (input: CreateOrderInput) => {
  const price = priceTicks(input.price);
  const quantity = quantityAtoms(input.quantity);
  assertValidLimitOrderInputs(price, quantity);
  return reservedAmountAtoms(multiplyPriceTicks(price, quantity));
};

const calculateReservedAmountForRemainingQuantity = (order: Pick<Order, "price" | "remainingQuantity">): bigint =>
  reservedAmountAtoms(multiplyPriceTicks(priceTicks(order.price), quantityAtoms(order.remainingQuantity)));

const determineOrderStatus = (order: Pick<Order, "quantity" | "remainingQuantity">): Order["status"] => {
  if (order.remainingQuantity === 0n) {
    return "filled";
  }

  if (order.remainingQuantity === order.quantity) {
    return "open";
  }

  return "partially_filled";
};

const updateMatchedOrderState = (
  order: StoredOrder | Order,
  remainingQuantity: bigint,
  updatedAt: string,
): Order => ({
  ...order,
  remainingQuantity,
  reservedAmount: calculateReservedAmountForRemainingQuantity({
    price: order.price,
    remainingQuantity,
  }),
  status: determineOrderStatus({
    quantity: order.quantity,
    remainingQuantity,
  }),
  updatedAt,
});

const absoluteQuantity = (value: bigint): bigint => (value < 0n ? -value : value);

const applyPositionFill = (
  currentPosition: PositionState | null,
  input: {
    userId: string;
    marketId: string;
    outcomeId: string;
    side: Order["side"];
    quantity: bigint;
    price: bigint;
    updatedAt: string;
  },
): PositionState => {
  const currentNetQuantity = currentPosition?.netQuantity ?? 0n;
  const delta = input.side === "buy" ? input.quantity : -input.quantity;
  const nextNetQuantity = currentNetQuantity + delta;

  let nextAverageEntryPrice = currentPosition?.averageEntryPrice ?? 0n;

  if (currentNetQuantity === 0n) {
    nextAverageEntryPrice = input.price;
  } else if (
    (currentNetQuantity > 0n && delta > 0n) ||
    (currentNetQuantity < 0n && delta < 0n)
  ) {
    const currentAbsoluteQuantity = absoluteQuantity(currentNetQuantity);
    const nextAbsoluteQuantity = absoluteQuantity(nextNetQuantity);
    nextAverageEntryPrice =
      ((currentAbsoluteQuantity * nextAverageEntryPrice) + (input.quantity * input.price)) /
      nextAbsoluteQuantity;
  } else if (nextNetQuantity === 0n) {
    nextAverageEntryPrice = 0n;
  } else if (absoluteQuantity(delta) > absoluteQuantity(currentNetQuantity)) {
    nextAverageEntryPrice = input.price;
  }

  return {
    id: currentPosition?.id ?? crypto.randomUUID(),
    userId: input.userId,
    marketId: input.marketId,
    outcomeId: input.outcomeId,
    netQuantity: nextNetQuantity,
    averageEntryPrice: nextAverageEntryPrice,
    realizedPnl: currentPosition?.realizedPnl ?? 0n,
    updatedAt: input.updatedAt,
  };
};

const buildTradeInsert = (
  fill: MatchFill,
  sequence: bigint,
  matchedAt: string,
): TradeInsertInput => ({
  id: crypto.randomUUID(),
  marketId: fill.marketId,
  outcomeId: fill.outcomeId,
  makerOrderId: fill.restingOrderId,
  takerOrderId: fill.incomingOrderId,
  makerUserId: fill.restingOrderId === fill.buyOrderId ? fill.buyerUserId : fill.sellerUserId,
  takerUserId: fill.incomingOrderId === fill.buyOrderId ? fill.buyerUserId : fill.sellerUserId,
  price: fill.price,
  quantity: fill.quantity,
  notional: reservedAmountAtoms(multiplyPriceTicks(priceTicks(fill.price), quantityAtoms(fill.quantity))),
  sequence,
  matchedAt,
});

const buildTradeSummary = (trade: TradeInsertInput): TradeSummary => ({
  id: trade.id,
  makerOrderId: trade.makerOrderId,
  takerOrderId: trade.takerOrderId,
  price: trade.price,
  quantity: trade.quantity,
  notional: trade.notional,
  sequence: trade.sequence,
  matchedAt: trade.matchedAt,
});

const toRecentTrade = (trade: TradeInsertInput, takerSide: Order["side"]): RecentTrade => ({
  id: trade.id,
  outcomeId: trade.outcomeId,
  priceTicks: trade.price,
  quantityAtoms: trade.quantity,
  takerSide,
  executedAt: trade.matchedAt,
});

const buildAcceptedOrder = (input: CreateOrderInput, reserveAmount: bigint, createdAt: string): Order => ({
  id: crypto.randomUUID(),
  marketId: input.marketId,
  outcomeId: input.outcomeId,
  userId: input.userId ?? DEMO_USER_ID,
  side: input.side,
  orderType: input.orderType,
  status: "pending",
  price: input.price,
  quantity: input.quantity,
  remainingQuantity: input.quantity,
  reservedAmount: reserveAmount,
  clientOrderId: input.clientOrderId ?? null,
  createdAt,
  updatedAt: createdAt,
});

const buildOrderSubmittedForMatchingCommand = (order: Order, enqueuedAt: string): OrderSubmittedForMatchingCommand => ({
  type: "order.submitted_for_matching",
  orderId: order.id,
  marketId: order.marketId,
  orderCreatedAt: order.createdAt,
  enqueuedAt,
});

const getPrivateSequenceBase = (processedAt: string, trades: readonly TradeInsertInput[]): bigint => {
  if (trades.length > 0) {
    return trades[trades.length - 1]?.sequence ?? 0n;
  }

  return BigInt(new Date(processedAt).getTime());
};

const buildRealtimePublications = async (
  db: DatabaseClient,
  postCommit: MatchingPostCommitState,
): Promise<RealtimePublication[]> => {
  const publications: RealtimePublication[] = [];
  const privateSequenceBase = postCommit.privateSequenceBase;

  for (const [index, trade] of postCommit.trades.entries()) {
    const sequence = postCommit.publicTradeSequences[index];

    if (sequence === undefined) {
      continue;
    }

    publications.push({
      channel: PUBLIC_MARKET_EVENTS_NOTIFICATION_CHANNEL,
      event: PublicTradeExecutedNotificationSchema.parse({
        type: "market.trade.executed",
        marketId: trade.marketId,
        trade: toRecentTrade(trade, postCommit.incomingSide),
        sequence,
      }),
    });
  }

  publications.push({
    channel: PUBLIC_MARKET_EVENTS_NOTIFICATION_CHANNEL,
    event: PublicOrderBookChangedNotificationSchema.parse({
      type: "market.orderbook.changed",
      marketId: postCommit.marketId,
      sequence: postCommit.publicOrderbookSequence,
    }),
  });

  for (const order of postCommit.orders) {
    publications.push({
      channel: `${PRIVATE_USER_CHANNEL_PREFIX}.${order.userId}`,
      event: PrivateOrderUpdatedEventSchema.parse({
        type: "private.order.updated",
        order,
        sequence: privateSequenceBase,
      }),
    });
  }

  for (const position of postCommit.positions) {
    publications.push({
      channel: `${PRIVATE_USER_CHANNEL_PREFIX}.${position.userId}`,
      event: PrivatePositionUpdatedEventSchema.parse({
        type: "private.position.updated",
        position,
        sequence: privateSequenceBase,
      }),
    });
  }

  for (const userId of postCommit.balanceUsers) {
    const balance: PortfolioBalance = await getBalanceSnapshot(db, {
      userId,
      currency: postCommit.collateralCurrency,
    });

    publications.push({
      channel: `${PRIVATE_USER_CHANNEL_PREFIX}.${userId}`,
      event: PrivateBalanceUpdatedEventSchema.parse({
        type: "private.balance.updated",
        currency: balance.currency,
        available: balance.available,
        reserved: balance.reserved,
        sequence: privateSequenceBase,
      }),
    });
  }

  return publications;
};

const processSubmittedOrderMatchingCommandInTransaction = async (
  db: DatabaseClient,
  orderId: string,
): Promise<MatchingTransactionResult> =>
  db.transaction(async (transaction) => {
    const existingOrder = await getOrderForUpdate(transaction, orderId);

    if (!existingOrder) {
      return {
        order: null,
        skippedReason: "not_found",
        postCommit: null,
      };
    }

    if (existingOrder.matchingProcessedAt) {
      return {
        order: existingOrder,
        skippedReason: "already_processed",
        postCommit: null,
      };
    }

    if (existingOrder.status === "cancelled" || existingOrder.status === "rejected") {
      const processedAt = new Date().toISOString();
      await markOrderMatchingProcessed(transaction, {
        orderId: existingOrder.id,
        processedAt,
      });

      return {
        order: {
          ...existingOrder,
          matchingProcessedAt: processedAt,
        },
        skippedReason: "terminal_before_match",
        postCommit: null,
      };
    }

    const restingOrders = await listMatchableRestingOrders(transaction, {
      orderId: existingOrder.id,
      marketId: existingOrder.marketId,
      outcomeId: existingOrder.outcomeId,
      incomingSide: existingOrder.side,
      price: existingOrder.price,
    });

    const matchResult = matchLimitOrder(existingOrder, restingOrders);
    const processedAt = new Date().toISOString();
    const tradeRecords: TradeInsertInput[] = [];
    const touchedOrders = new Map<string, Order>();
    const touchedPositions = new Map<string, Position>();
    const balanceUsers = new Set<string>([existingOrder.userId]);
    const ordersById = new Map<string, StoredOrder>([
      [existingOrder.id, existingOrder],
      ...restingOrders.map((order) => [order.id, order] as const),
    ]);

    let nextTradeSequence = 0n;
    if (matchResult.fills.length > 0) {
      await lockTradeSequenceForMarket(transaction, existingOrder.marketId);
      nextTradeSequence = await getNextTradeSequence(transaction, existingOrder.marketId);
    }

    for (const fill of matchResult.fills) {
      const trade = buildTradeInsert(fill, nextTradeSequence, processedAt);
      nextTradeSequence += 1n;

      await insertTrade(transaction, trade);
      tradeRecords.push(trade);

      const buyerOrder = ordersById.get(fill.buyOrderId);
      const sellerOrder = ordersById.get(fill.sellOrderId);

      if (!buyerOrder || !sellerOrder) {
        throw new Error("matched order missing from transaction state");
      }

      const settlement = settleMatchedTrade({
        journalId: crypto.randomUUID(),
        createdAt: processedAt,
        reference: `trade:${trade.id}:settle`,
        tradeId: trade.id,
        outcomeId: fill.outcomeId,
        currency: DEFAULT_COLLATERAL_CURRENCY,
        price: fill.price,
        quantity: fill.quantity,
        buyer: {
          orderId: buyerOrder.id,
          userId: buyerOrder.userId,
          orderPrice: buyerOrder.price,
        },
        seller: {
          orderId: sellerOrder.id,
          userId: sellerOrder.userId,
        },
      });

      await insertLedgerMutation(transaction, settlement);
      balanceUsers.add(fill.buyerUserId);
      balanceUsers.add(fill.sellerUserId);

      for (const positionInput of [
        {
          userId: fill.buyerUserId,
          side: "buy" as const,
        },
        {
          userId: fill.sellerUserId,
          side: "sell" as const,
        },
      ]) {
        const currentPosition = await getPositionForUpdate(transaction, {
          userId: positionInput.userId,
          marketId: fill.marketId,
          outcomeId: fill.outcomeId,
        });

        const nextPosition = applyPositionFill(currentPosition, {
          userId: positionInput.userId,
          marketId: fill.marketId,
          outcomeId: fill.outcomeId,
          side: positionInput.side,
          quantity: fill.quantity,
          price: fill.price,
          updatedAt: processedAt,
        });

        await upsertPosition(transaction, nextPosition);
        touchedPositions.set(nextPosition.id, nextPosition);
      }
    }

    const updatedIncomingOrder = updateMatchedOrderState(
      existingOrder,
      matchResult.incomingRemainingQuantity,
      processedAt,
    );
    await updateOrder(transaction, updatedIncomingOrder);
    await markOrderMatchingProcessed(transaction, {
      orderId: updatedIncomingOrder.id,
      processedAt,
    });
    touchedOrders.set(updatedIncomingOrder.id, updatedIncomingOrder);

    for (const restingOrder of restingOrders) {
      const updatedRemainingQuantity =
        matchResult.restingRemainingQuantities[restingOrder.id] ?? restingOrder.remainingQuantity;

      if (updatedRemainingQuantity === restingOrder.remainingQuantity) {
        continue;
      }

      const updatedRestingOrder = updateMatchedOrderState(
        restingOrder,
        updatedRemainingQuantity,
        processedAt,
      );
      await updateOrder(transaction, updatedRestingOrder);
      touchedOrders.set(updatedRestingOrder.id, updatedRestingOrder);
    }

    const publicSequences = await allocatePublicMarketSequences(
      transaction,
      existingOrder.marketId,
      tradeRecords.length + 1,
    );
    const privateSequenceBase = getPrivateSequenceBase(processedAt, tradeRecords);

    return {
      order: updatedIncomingOrder,
      skippedReason: null,
      postCommit: {
        marketId: existingOrder.marketId,
        outcomeId: existingOrder.outcomeId,
        incomingSide: existingOrder.side,
        privateSequenceBase,
        publicOrderbookSequence: publicSequences[tradeRecords.length] ?? privateSequenceBase,
        publicTradeSequences: publicSequences.slice(0, tradeRecords.length),
        trades: tradeRecords,
        orders: [...touchedOrders.values()],
        positions: [...touchedPositions.values()],
        balanceUsers: [...balanceUsers],
        collateralCurrency: DEFAULT_COLLATERAL_CURRENCY,
      },
    };
  });

export interface TradingServiceDependencies {
  db?: DatabaseClient;
  queue?: SubmittedOrderMatchingQueue;
  realtimePublisher?: RealtimePublisher;
}

const resolveDependencies = (
  dependencies: TradingServiceDependencies = {},
): Required<TradingServiceDependencies> => {
  const db = dependencies.db ?? createDatabaseClient();

  return {
    db,
    queue: dependencies.queue ?? createSubmittedOrderMatchingQueue({ db }),
    realtimePublisher: dependencies.realtimePublisher ?? createRealtimePublisher(db),
  };
};

export const createOrder = async (
  input: CreateOrderInput,
  dependencies: TradingServiceDependencies = {},
): Promise<CreateOrderResult> => {
  if (input.orderType !== "limit") {
    throw new Error("only limit orders can reserve funds in this milestone");
  }

  const reserveAmount = calculateRequiredReserveAmount(input);
  const { db, queue } = resolveDependencies(dependencies);

  const { order, reserve } = await db.transaction(async (transaction) => {
    const marketSelection = await getMarketSelection(transaction, {
      marketId: input.marketId,
      outcomeId: input.outcomeId,
    });

    if (!marketSelection) {
      throw new Error("market or outcome not found");
    }

    if (marketSelection.marketStatus !== "open") {
      throw new Error("market is not open");
    }

    const createdAt = new Date().toISOString();
    const nextOrder = buildAcceptedOrder(input, reserveAmount, createdAt);
    assertOrderCanReserve(nextOrder.status);

    const nextReserve = reserveForOrder({
      journalId: nextOrder.id,
      createdAt,
      reference: `order:${nextOrder.id}:reserve`,
      orderId: nextOrder.id,
      userId: nextOrder.userId,
      currency: DEFAULT_COLLATERAL_CURRENCY,
      amount: reserveAmount,
    });

    await insertOrder(transaction, nextOrder);
    await insertLedgerMutation(transaction, nextReserve);
    await queue.enqueue(
      transaction,
      buildOrderSubmittedForMatchingCommand(nextOrder, createdAt),
    );

    logger.info("trading.order.accepted", {
      orderId: nextOrder.id,
      marketId: nextOrder.marketId,
      outcomeId: nextOrder.outcomeId,
      userId: nextOrder.userId,
    });

    return {
      order: nextOrder,
      reserve: nextReserve,
    };
  });

  return {
    order,
    reserve: buildJournalSummary(reserve),
    status: order.status,
    trades: [],
  };
};

export const cancelOrder = async (
  input: CancelOrderInput,
  dependencies: TradingServiceDependencies = {},
): Promise<CancelOrderResult> => {
  const { db } = resolveDependencies(dependencies);

  const { order, release } = await db.transaction(async (transaction) => {
    const existingOrder = await getOrderForUpdate(transaction, input.orderId);
    if (!existingOrder) {
      throw new Error("order not found");
    }

    assertOrderCanCancel(existingOrder.status);

    const releasedAmount = reservedAmountAtoms(existingOrder.reservedAmount);
    const releasedAt = new Date().toISOString();
    const nextRelease = releaseOrderReserve({
      journalId: crypto.randomUUID(),
      createdAt: releasedAt,
      reference: `order:${existingOrder.id}:release`,
      orderId: existingOrder.id,
      userId: existingOrder.userId,
      currency: DEFAULT_COLLATERAL_CURRENCY,
      amount: releasedAmount,
      remainingReservedAmount: reservedAmountAtoms(existingOrder.reservedAmount),
    });

    const cancelledOrder: Order = {
      ...existingOrder,
      status: "cancelled",
      reservedAmount: 0n,
      updatedAt: releasedAt,
    };

    await updateCancelledOrder(transaction, cancelledOrder);
    await insertLedgerMutation(transaction, nextRelease);

    return {
      order: cancelledOrder,
      release: nextRelease,
    };
  });

  logger.info("trading.order.cancelled", { orderId: order.id });

  return {
    order,
    release: buildJournalSummary(release),
    status: "cancelled",
  };
};

export interface ProcessSubmittedOrderMatchingResult {
  processed: boolean;
  orderId: string;
  commandId: string;
  skippedReason: MatchingTransactionResult["skippedReason"];
}

export const processNextSubmittedOrderMatchingJob = async (
  dependencies: TradingServiceDependencies = {},
): Promise<ProcessSubmittedOrderMatchingResult | null> => {
  const { db, queue, realtimePublisher } = resolveDependencies(dependencies);
  const claimed = await queue.claimNext();

  if (!claimed) {
    return null;
  }

  logger.info("trading.matching.claimed", {
    commandId: claimed.id,
    orderId: claimed.orderId,
    marketId: claimed.marketId,
    attemptCount: claimed.attemptCount,
  });

  try {
    const result = await processSubmittedOrderMatchingCommandInTransaction(db, claimed.orderId);
    const processedAt = new Date().toISOString();

    await queue.markProcessed({
      commandId: claimed.id,
      claimToken: claimed.claimToken,
      processedAt,
    });

    if (result.postCommit) {
      const publications = await buildRealtimePublications(db, result.postCommit);
      try {
        await realtimePublisher.publish(publications);
      } catch (error) {
        logger.error("trading.realtime.publish_failed", {
          commandId: claimed.id,
          orderId: claimed.orderId,
          error: error instanceof Error ? error.message : "unknown realtime publish error",
        });
      }
    }

    logger.info("trading.matching.processed", {
      commandId: claimed.id,
      orderId: claimed.orderId,
      skippedReason: result.skippedReason,
    });

    return {
      processed: true,
      orderId: claimed.orderId,
      commandId: claimed.id,
      skippedReason: result.skippedReason,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown matching error";
    logger.error("trading.matching.failed", {
      commandId: claimed.id,
      orderId: claimed.orderId,
      error: message,
    });

    await queue.markFailed({
      commandId: claimed.id,
      claimToken: claimed.claimToken,
      errorMessage: message,
    });

    throw error;
  }
};

export const drainSubmittedOrderMatchingQueue = async (
  dependencies: TradingServiceDependencies = {},
): Promise<number> => {
  let processedCount = 0;

  while (true) {
    const result = await processNextSubmittedOrderMatchingJob(dependencies);
    if (!result) {
      return processedCount;
    }

    processedCount += 1;
  }
};
