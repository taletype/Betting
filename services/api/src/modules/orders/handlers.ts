import type { Order } from "@bet/contracts";
import {
  assertOrderCanCancel,
  assertOrderCanReserve,
  assertValidLimitOrderInputs,
  multiplyPriceTicks,
  priceTicks,
  quantityAtoms,
  reservedAmountAtoms,
} from "@bet/domain";
import { releaseOrderReserve, reserveForOrder, type LedgerMutationResult } from "@bet/ledger";

export interface CreateOrderInput {
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

export interface CreateOrderResult {
  order: Order;
  reserve: OrderJournalSummary;
  status: "accepted";
}

export interface CancelOrderResult {
  order: Order;
  release: OrderJournalSummary;
  status: "cancelled";
}

export interface OrderRepository {
  saveAcceptedOrder(input: { order: Order; reserve: LedgerMutationResult }): Promise<void>;
  getOrderForCancellation(orderId: string): Promise<Order | null>;
  saveCancelledOrder(input: { order: Order; release: LedgerMutationResult }): Promise<void>;
}

const stubOrderRepository: OrderRepository = {
  async saveAcceptedOrder() {
    // TODO: persist order row, journal row, and entry rows in one transaction.
  },
  async getOrderForCancellation(orderId: string) {
    return buildSimulatedOpenOrder(orderId);
  },
  async saveCancelledOrder() {
    // TODO: persist cancelled order update and release journal in one transaction.
  },
};

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

const buildAcceptedOrder = (input: CreateOrderInput, reserveAmount: bigint, createdAt: string): Order => ({
  id: crypto.randomUUID(),
  marketId: input.marketId,
  outcomeId: input.outcomeId,
  userId: "00000000-0000-4000-8000-000000000001",
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

const buildSimulatedOpenOrder = (orderId: string): Order => ({
  id: orderId,
  marketId: "11111111-1111-4111-8111-111111111111",
  outcomeId: "22222222-2222-4222-8222-222222222222",
  userId: "00000000-0000-4000-8000-000000000001",
  side: "buy",
  orderType: "limit",
  status: "open",
  price: 10n,
  quantity: 25n,
  remainingQuantity: 25n,
  reservedAmount: 250n,
  clientOrderId: `client-${orderId}`,
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:00:00.000Z",
});

export const createOrder = async (
  input: CreateOrderInput,
  repository: OrderRepository = stubOrderRepository,
): Promise<CreateOrderResult> => {
  if (input.orderType !== "limit") {
    throw new Error("only limit orders can reserve funds in this milestone");
  }

  const createdAt = new Date().toISOString();
  const reserveAmount = calculateRequiredReserveAmount(input);
  const order = buildAcceptedOrder(input, reserveAmount, createdAt);
  assertOrderCanReserve(order.status);

  const reserve = reserveForOrder({
    journalId: `${order.id}:reserve`,
    createdAt,
    reference: `order:${order.id}:reserve`,
    orderId: order.id,
    userId: order.userId,
    currency: "USD",
    amount: reserveAmount,
  });

  await repository.saveAcceptedOrder({ order, reserve });

  return {
    order,
    reserve: buildJournalSummary(reserve),
    status: "accepted",
  };
};

export const cancelOrder = async (
  input: CancelOrderInput,
  repository: OrderRepository = stubOrderRepository,
): Promise<CancelOrderResult> => {
  const existingOrder = await repository.getOrderForCancellation(input.orderId);
  if (!existingOrder) {
    throw new Error("order not found");
  }

  assertOrderCanCancel(existingOrder.status);

  const releasedAmount = reservedAmountAtoms(existingOrder.reservedAmount);
  const releasedAt = new Date().toISOString();
  const release = releaseOrderReserve({
    journalId: `${existingOrder.id}:release`,
    createdAt: releasedAt,
    reference: `order:${existingOrder.id}:release`,
    orderId: existingOrder.id,
    userId: existingOrder.userId,
    currency: "USD",
    amount: releasedAmount,
    remainingReservedAmount: reservedAmountAtoms(existingOrder.reservedAmount),
  });

  const cancelledOrder: Order = {
    ...existingOrder,
    status: "cancelled",
    reservedAmount: 0n,
    updatedAt: releasedAt,
  };

  await repository.saveCancelledOrder({ order: cancelledOrder, release });

  return {
    order: cancelledOrder,
    release: buildJournalSummary(release),
    status: "cancelled",
  };
};
