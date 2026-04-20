import {
  assertCancelReleaseWithinReserved,
  assertLedgerAmountNonNegative,
  assertBalancedJournalEntries,
} from "./shared";
import type { LedgerBalanceDelta, LedgerEntry, LedgerJournal, LedgerMutationResult } from "./types";

import {
  multiplyPriceTicks,
  priceTicks,
  quantityAtoms,
  reservedAmountAtoms,
  type ReservedAmountAtoms,
} from "@bet/domain";

export interface OrderJournalBuilderInput {
  journalId: string;
  createdAt: string;
  reference: string;
  orderId: string;
  userId: string;
  currency: string;
  amount: ReservedAmountAtoms;
}

export interface ReleaseOrderJournalBuilderInput extends OrderJournalBuilderInput {
  remainingReservedAmount: ReservedAmountAtoms;
}

export interface TradeSettlementJournalBuilderInput {
  journalId: string;
  createdAt: string;
  reference: string;
  tradeId: string;
  outcomeId: string;
  currency: string;
  price: bigint;
  quantity: bigint;
  buyer: {
    orderId: string;
    userId: string;
    orderPrice: bigint;
  };
  seller: {
    orderId: string;
    userId: string;
  };
}

const buildAvailableFundsAccountCode = (userId: string): string => `user:${userId}:funds:available`;
const buildReservedFundsAccountCode = (userId: string): string => `user:${userId}:funds:reserved`;
const buildLongPositionAccountCode = (userId: string, outcomeId: string): string =>
  `user:${userId}:position:${outcomeId}:long`;
const buildShortPositionAccountCode = (userId: string, outcomeId: string): string =>
  `user:${userId}:position:${outcomeId}:short`;

const createJournal = (
  input: OrderJournalBuilderInput,
  kind: "order_reserve" | "order_release",
): LedgerJournal => ({
  id: input.journalId,
  kind,
  reference: input.reference,
  createdAt: input.createdAt,
  metadata: {
    orderId: input.orderId,
    userId: input.userId,
  },
});

const createEntryId = (journalId: string, suffix: "1" | "2"): string => `${journalId}:${suffix}`;

const createTradeSettlementEntryId = (journalId: string, suffix: number): string =>
  `${journalId}:${suffix}`;

export const buildOrderReserveEntries = (input: OrderJournalBuilderInput): readonly LedgerEntry[] => {
  assertLedgerAmountNonNegative(input.amount, "reserve amount");

  return [
    {
      id: createEntryId(input.journalId, "1"),
      journalId: input.journalId,
      accountCode: buildReservedFundsAccountCode(input.userId),
      direction: "debit",
      amount: input.amount,
      currency: input.currency,
    },
    {
      id: createEntryId(input.journalId, "2"),
      journalId: input.journalId,
      accountCode: buildAvailableFundsAccountCode(input.userId),
      direction: "credit",
      amount: input.amount,
      currency: input.currency,
    },
  ];
};

export const buildOrderReleaseEntries = (
  input: ReleaseOrderJournalBuilderInput,
): readonly LedgerEntry[] => {
  assertCancelReleaseWithinReserved(input.amount, input.remainingReservedAmount);

  return [
    {
      id: createEntryId(input.journalId, "1"),
      journalId: input.journalId,
      accountCode: buildAvailableFundsAccountCode(input.userId),
      direction: "debit",
      amount: input.amount,
      currency: input.currency,
    },
    {
      id: createEntryId(input.journalId, "2"),
      journalId: input.journalId,
      accountCode: buildReservedFundsAccountCode(input.userId),
      direction: "credit",
      amount: input.amount,
      currency: input.currency,
    },
  ];
};

const createBalanceDeltas = (
  input: OrderJournalBuilderInput,
  kind: "order_reserve" | "order_release",
): readonly LedgerBalanceDelta[] => {
  const signedAmount = kind === "order_reserve" ? input.amount : -input.amount;
  return [
    {
      accountCode: buildAvailableFundsAccountCode(input.userId),
      currency: input.currency,
      delta: -signedAmount,
    },
    {
      accountCode: buildReservedFundsAccountCode(input.userId),
      currency: input.currency,
      delta: signedAmount,
    },
  ];
};

export const reserveForOrder = (input: OrderJournalBuilderInput): LedgerMutationResult => {
  const journal = createJournal(input, "order_reserve");
  const entries = buildOrderReserveEntries(input);
  assertBalancedJournalEntries(entries);

  return {
    journal,
    entries,
    balanceDeltas: createBalanceDeltas(input, "order_reserve"),
  };
};

export const releaseOrderReserve = (
  input: ReleaseOrderJournalBuilderInput,
): LedgerMutationResult => {
  const journal = createJournal(input, "order_release");
  const entries = buildOrderReleaseEntries(input);
  assertBalancedJournalEntries(entries);

  return {
    journal,
    entries,
    balanceDeltas: createBalanceDeltas(input, "order_release"),
  };
};

export const settleMatchedTrade = (
  input: TradeSettlementJournalBuilderInput,
): LedgerMutationResult => {
  const tradeNotional = reservedAmountAtoms(
    multiplyPriceTicks(priceTicks(input.price), quantityAtoms(input.quantity)),
  );
  const buyerReservedConsumption = reservedAmountAtoms(
    multiplyPriceTicks(priceTicks(input.buyer.orderPrice), quantityAtoms(input.quantity)),
  );
  const buyerPriceImprovement = buyerReservedConsumption - tradeNotional;

  assertLedgerAmountNonNegative(tradeNotional, "trade notional");
  assertLedgerAmountNonNegative(buyerReservedConsumption, "buyer reserved consumption");
  assertLedgerAmountNonNegative(buyerPriceImprovement, "buyer price improvement");

  const journal: LedgerJournal = {
    id: input.journalId,
    kind: "settle",
    reference: input.reference,
    createdAt: input.createdAt,
    metadata: {
      tradeId: input.tradeId,
      buyerOrderId: input.buyer.orderId,
      buyerUserId: input.buyer.userId,
      sellerOrderId: input.seller.orderId,
      sellerUserId: input.seller.userId,
      feeAtoms: "0",
    },
  };

  const entries: LedgerEntry[] = [
    {
      id: createTradeSettlementEntryId(input.journalId, 1),
      journalId: input.journalId,
      accountCode: buildLongPositionAccountCode(input.buyer.userId, input.outcomeId),
      direction: "debit",
      amount: tradeNotional,
      currency: input.currency,
    },
    {
      id: createTradeSettlementEntryId(input.journalId, 2),
      journalId: input.journalId,
      accountCode: buildReservedFundsAccountCode(input.buyer.userId),
      direction: "credit",
      amount: tradeNotional,
      currency: input.currency,
    },
    {
      id: createTradeSettlementEntryId(input.journalId, 3),
      journalId: input.journalId,
      accountCode: buildShortPositionAccountCode(input.seller.userId, input.outcomeId),
      direction: "debit",
      amount: tradeNotional,
      currency: input.currency,
    },
    {
      id: createTradeSettlementEntryId(input.journalId, 4),
      journalId: input.journalId,
      accountCode: buildReservedFundsAccountCode(input.seller.userId),
      direction: "credit",
      amount: tradeNotional,
      currency: input.currency,
    },
  ];

  const balanceDeltas: LedgerBalanceDelta[] = [
    {
      accountCode: buildLongPositionAccountCode(input.buyer.userId, input.outcomeId),
      currency: input.currency,
      delta: tradeNotional,
    },
    {
      accountCode: buildReservedFundsAccountCode(input.buyer.userId),
      currency: input.currency,
      delta: -tradeNotional,
    },
    {
      accountCode: buildShortPositionAccountCode(input.seller.userId, input.outcomeId),
      currency: input.currency,
      delta: tradeNotional,
    },
    {
      accountCode: buildReservedFundsAccountCode(input.seller.userId),
      currency: input.currency,
      delta: -tradeNotional,
    },
  ];

  if (buyerPriceImprovement > 0n) {
    entries.push(
      {
        id: createTradeSettlementEntryId(input.journalId, 5),
        journalId: input.journalId,
        accountCode: buildAvailableFundsAccountCode(input.buyer.userId),
        direction: "debit",
        amount: buyerPriceImprovement,
        currency: input.currency,
      },
      {
        id: createTradeSettlementEntryId(input.journalId, 6),
        journalId: input.journalId,
        accountCode: buildReservedFundsAccountCode(input.buyer.userId),
        direction: "credit",
        amount: buyerPriceImprovement,
        currency: input.currency,
      },
    );

    balanceDeltas.push(
      {
        accountCode: buildAvailableFundsAccountCode(input.buyer.userId),
        currency: input.currency,
        delta: buyerPriceImprovement,
      },
      {
        accountCode: buildReservedFundsAccountCode(input.buyer.userId),
        currency: input.currency,
        delta: -buyerPriceImprovement,
      },
    );
  }

  assertBalancedJournalEntries(entries);

  return {
    journal,
    entries,
    balanceDeltas,
  };
};
