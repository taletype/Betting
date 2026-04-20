import type { Order } from "@bet/contracts";

export interface MatchableOrder
  extends Pick<
    Order,
    | "id"
    | "marketId"
    | "outcomeId"
    | "userId"
    | "side"
    | "price"
    | "remainingQuantity"
    | "createdAt"
  > {}

export interface MatchFill {
  restingOrderId: string;
  incomingOrderId: string;
  marketId: string;
  outcomeId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyerUserId: string;
  sellerUserId: string;
  price: bigint;
  quantity: bigint;
}

export interface MatchResult {
  fills: MatchFill[];
  incomingRemainingQuantity: bigint;
  restingRemainingQuantities: Record<string, bigint>;
}

const comparePriceTimePriority = (left: MatchableOrder, right: MatchableOrder, incomingSide: Order["side"]) => {
  if (left.price !== right.price) {
    if (incomingSide === "buy") {
      return left.price < right.price ? -1 : 1;
    }

    return left.price > right.price ? -1 : 1;
  }

  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return left.id.localeCompare(right.id);
};

const isCrossingOrder = (incomingOrder: MatchableOrder, restingOrder: MatchableOrder): boolean => {
  if (incomingOrder.marketId !== restingOrder.marketId) {
    return false;
  }

  if (incomingOrder.outcomeId !== restingOrder.outcomeId) {
    return false;
  }

  if (incomingOrder.side === restingOrder.side) {
    return false;
  }

  if (restingOrder.remainingQuantity <= 0n) {
    return false;
  }

  return incomingOrder.side === "buy"
    ? incomingOrder.price >= restingOrder.price
    : incomingOrder.price <= restingOrder.price;
};

const getTradePrice = (incomingOrder: MatchableOrder, restingOrder: MatchableOrder): bigint =>
  incomingOrder.side === "buy" ? restingOrder.price : incomingOrder.price;

export const matchLimitOrder = (
  incomingOrder: MatchableOrder,
  candidateRestingOrders: readonly MatchableOrder[],
): MatchResult => {
  let incomingRemainingQuantity = incomingOrder.remainingQuantity;
  const restingRemainingQuantities: Record<string, bigint> = {};
  const fills: MatchFill[] = [];

  const sortedCandidates = [...candidateRestingOrders]
    .filter((restingOrder) => isCrossingOrder(incomingOrder, restingOrder))
    .sort((left, right) => comparePriceTimePriority(left, right, incomingOrder.side));

  for (const restingOrder of sortedCandidates) {
    if (incomingRemainingQuantity === 0n) {
      break;
    }

    const restingRemainingQuantity = restingRemainingQuantities[restingOrder.id] ?? restingOrder.remainingQuantity;
    if (restingRemainingQuantity === 0n) {
      continue;
    }

    const fillQuantity =
      incomingRemainingQuantity < restingRemainingQuantity
        ? incomingRemainingQuantity
        : restingRemainingQuantity;
    const updatedRestingRemainingQuantity = restingRemainingQuantity - fillQuantity;

    incomingRemainingQuantity -= fillQuantity;
    restingRemainingQuantities[restingOrder.id] = updatedRestingRemainingQuantity;

    const buyOrder = incomingOrder.side === "buy" ? incomingOrder : restingOrder;
    const sellOrder = incomingOrder.side === "sell" ? incomingOrder : restingOrder;

    fills.push({
      restingOrderId: restingOrder.id,
      incomingOrderId: incomingOrder.id,
      marketId: incomingOrder.marketId,
      outcomeId: incomingOrder.outcomeId,
      buyOrderId: buyOrder.id,
      sellOrderId: sellOrder.id,
      buyerUserId: buyOrder.userId,
      sellerUserId: sellOrder.userId,
      price: getTradePrice(incomingOrder, restingOrder),
      quantity: fillQuantity,
    });
  }

  return {
    fills,
    incomingRemainingQuantity,
    restingRemainingQuantities,
  };
};
