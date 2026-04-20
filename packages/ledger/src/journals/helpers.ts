import {
  assertCancelReleaseWithinReserved,
  assertLedgerAmountNonNegative,
  assertBalancedJournalEntries,
} from "./shared";
import type { LedgerBalanceDelta, LedgerEntry, LedgerJournal, LedgerMutationResult } from "./types";

import type { ReservedAmountAtoms } from "@bet/domain";

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

const buildAvailableFundsAccountCode = (userId: string): string => `user:${userId}:funds:available`;
const buildReservedFundsAccountCode = (userId: string): string => `user:${userId}:funds:reserved`;

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
