import type { Order } from "@bet/contracts";
import { createDatabaseClient } from "@bet/db";
import { incrementCounter, logger } from "@bet/observability";
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

import {
  getNextTradeSequence,
  getPositionForUpdate,
  getMarketSelection,
  getOrderForUpdate,
  insertLedgerMutation,
  insertOrder,
  insertTrade,
  listMatchableRestingOrders,
  lockTradeSequenceForMarket,
  type PositionState,
  type TradeInsertInput,
  updateOrder,
  upsertPosition,
  updateCancelledOrder,
} from "./repository";
import { DEFAULT_COLLATERAL_CURRENCY, DEMO_USER_ID } from "../shared/constants";
import { toJson } from "../../presenters/json";
import {
  hashRequestPayload,
  markIdempotencyReplay,
  persistIdempotencyResponse,
  reserveIdempotencyKey,
} from "../shared/idempotency";
import { insertAuditRecord } from "../shared/audit";

export interface CreateOrderInput {
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  orderType: "limit" | "market";
  price: bigint;
  quantity: bigint;
  clientOrderId?: string | null;
  idempotencyKey?: string | null;
}

export interface CancelOrderInput {
  orderId: string;
}

export interface OrderJournalSummary {
  journal: LedgerMutationResult["journal"];
  entryCount: number;
  balanceDeltas: LedgerMutationResult["balanceDeltas"];
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
  order: Order,
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

const buildAcceptedOrder = (input: CreateOrderInput, reserveAmount: bigint, createdAt: string): Order => ({
  id: crypto.randomUUID(),
  marketId: input.marketId,
  outcomeId: input.outcomeId,
  userId: DEMO_USER_ID,
  side: input.side,
  orderType: input.orderType,
  status: "open",
  price: input.price,
  quantity: input.quantity,
  remainingQuantity: input.quantity,
  reservedAmount: reserveAmount,
  clientOrderId: input.clientOrderId ?? null,
  createdAt,
  updatedAt: createdAt,
});

export const createOrder = async (
  input: CreateOrderInput,
): Promise<CreateOrderResult> => {
  if (input.orderType !== "limit") {
    throw new Error("only limit orders can reserve funds in this milestone");
  }

  const reserveAmount = calculateRequiredReserveAmount(input);
  const db = createDatabaseClient();
  const postCommitEvents: Array<{ type: string; metadata: Record<string, string> }> = [];

  const { order, reserve, trades, replayResponse } = await db.transaction(async (transaction) => {
    if (input.idempotencyKey) {
      const idempotency = await reserveIdempotencyKey(transaction, {
        scope: "orders:create",
        key: input.idempotencyKey,
        requestHash: hashRequestPayload({
          marketId: input.marketId,
          outcomeId: input.outcomeId,
          side: input.side,
          orderType: input.orderType,
          price: input.price.toString(),
          quantity: input.quantity.toString(),
          clientOrderId: input.clientOrderId ?? null,
        }),
      });

      if (idempotency.isReplay && idempotency.response) {
        await markIdempotencyReplay(transaction, {
          scope: "orders:create",
          key: input.idempotencyKey,
        });
        await insertAuditRecord(transaction, {
          actorUserId: DEMO_USER_ID,
          action: "idempotency.replay",
          entityType: "order",
          entityId: input.marketId,
          metadata: {
            scope: "orders:create",
            idempotencyKey: input.idempotencyKey,
            replayCount: idempotency.response.replayCount,
          },
        });
        logger.info("order create idempotency replay", {
          marketId: input.marketId,
          idempotencyKey: input.idempotencyKey,
        });

        const parsed = JSON.parse(idempotency.response.body) as CreateOrderResult;
        return {
          order: parsed.order,
          reserve: parsed.reserve,
          trades: parsed.trades,
          replayResponse: idempotency.response,
        };
      }
    }

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

    const restingOrders = await listMatchableRestingOrders(transaction, {
      orderId: nextOrder.id,
      marketId: nextOrder.marketId,
      outcomeId: nextOrder.outcomeId,
      incomingSide: nextOrder.side,
      price: nextOrder.price,
    });

    const matchResult = matchLimitOrder(nextOrder, restingOrders);
    const tradeSummaries: TradeSummary[] = [];

    if (matchResult.fills.length > 0) {
      await lockTradeSequenceForMarket(transaction, nextOrder.marketId);
      let nextTradeSequence = await getNextTradeSequence(transaction, nextOrder.marketId);
      const updatedAt = new Date().toISOString();

      const ordersById = new Map<string, Order>([
        [nextOrder.id, nextOrder],
        ...restingOrders.map((order) => [order.id, order] as const),
      ]);
      const touchedPositionKeys = new Set<string>();

      for (const fill of matchResult.fills) {
        const trade = buildTradeInsert(fill, nextTradeSequence, updatedAt);
        nextTradeSequence += 1n;

        await insertTrade(transaction, trade);
        postCommitEvents.push({
          type: "order.matched",
          metadata: {
            marketId: fill.marketId,
            outcomeId: fill.outcomeId,
            quantity: fill.quantity.toString(),
            price: fill.price.toString(),
          },
        });
        postCommitEvents.push({
          type: "trade.persisted",
          metadata: {
            tradeId: trade.id,
            makerOrderId: trade.makerOrderId,
            takerOrderId: trade.takerOrderId,
            sequence: trade.sequence.toString(),
            marketId: fill.marketId,
          },
        });
        tradeSummaries.push(buildTradeSummary(trade));

        const buyerOrder = ordersById.get(fill.buyOrderId);
        const sellerOrder = ordersById.get(fill.sellOrderId);

        if (!buyerOrder || !sellerOrder) {
          throw new Error("matched order missing from transaction state");
        }

        const settlement = settleMatchedTrade({
          journalId: crypto.randomUUID(),
          createdAt: updatedAt,
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
          const positionKey = `${positionInput.userId}:${fill.marketId}:${fill.outcomeId}`;
          const currentPosition = touchedPositionKeys.has(positionKey)
            ? await getPositionForUpdate(transaction, {
                userId: positionInput.userId,
                marketId: fill.marketId,
                outcomeId: fill.outcomeId,
              })
            : await getPositionForUpdate(transaction, {
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
            updatedAt,
          });

          await upsertPosition(transaction, nextPosition);
          touchedPositionKeys.add(positionKey);
        }
      }

      const updatedIncomingOrder = updateMatchedOrderState(
        nextOrder,
        matchResult.incomingRemainingQuantity,
        updatedAt,
      );

      if (
        updatedIncomingOrder.remainingQuantity !== nextOrder.remainingQuantity ||
        updatedIncomingOrder.status !== nextOrder.status ||
        updatedIncomingOrder.reservedAmount !== nextOrder.reservedAmount
      ) {
        await updateOrder(transaction, updatedIncomingOrder);
      }

      for (const restingOrder of restingOrders) {
        const updatedRemainingQuantity =
          matchResult.restingRemainingQuantities[restingOrder.id] ?? restingOrder.remainingQuantity;

        if (updatedRemainingQuantity === restingOrder.remainingQuantity) {
          continue;
        }

        await updateOrder(
          transaction,
          updateMatchedOrderState(restingOrder, updatedRemainingQuantity, updatedAt),
        );
      }

      return {
        order: updatedIncomingOrder,
        reserve: nextReserve,
        trades: tradeSummaries,
        replayResponse: null,
      };
    }

    return {
      order: nextOrder,
      reserve: nextReserve,
      trades: tradeSummaries,
      replayResponse: null,
    };
  });

  if (replayResponse) {
    return JSON.parse(replayResponse.body) as CreateOrderResult;
  }

  const response: CreateOrderResult = {
    order,
    reserve: buildJournalSummary(reserve),
    status: order.status,
    trades,
  };

  logger.info("order accepted", {
    orderId: order.id,
    marketId: order.marketId,
    outcomeId: order.outcomeId,
    side: order.side,
    quantity: order.quantity.toString(),
    price: order.price.toString(),
    status: order.status,
  });
  incrementCounter("orders_accepted_total", {
    marketId: order.marketId,
    outcomeId: order.outcomeId,
  });
  for (const event of postCommitEvents) {
    logger.info(event.type, event.metadata);
    if (event.type === "trade.persisted") {
      incrementCounter("trades_persisted_total", {
        marketId: event.metadata.marketId ?? order.marketId,
      });
    }
  }

  if (input.idempotencyKey) {
    const mutationDb = createDatabaseClient();
    await mutationDb.transaction(async (transaction) => {
      await persistIdempotencyResponse(transaction, {
        scope: "orders:create",
        key: input.idempotencyKey ?? "",
        responseStatus: 202,
        responseBody: toJson(response),
      });
    });
  }

  return response;
};

export const cancelOrder = async (
  input: CancelOrderInput,
): Promise<CancelOrderResult> => {
  const db = createDatabaseClient();

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

  const response: CancelOrderResult = {
    order,
    release: buildJournalSummary(release),
    status: "cancelled",
  };

  logger.info("order cancelled", {
    orderId: order.id,
    marketId: order.marketId,
    releasedAmount: order.reservedAmount.toString(),
  });
  incrementCounter("orders_cancelled_total", {
    marketId: order.marketId,
  });

  return response;
};
