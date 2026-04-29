import type { MoneyAtoms } from "@bet/domain";

export type LedgerJournalKind =
  | "order_reserve"
  | "order_release"
  | "reserve"
  | "release"
  | "settle"
  | "deposit"
  | "deposit_confirmed"
  | "withdrawal"
  | "withdrawal_requested"
  | "withdrawal_completed"
  | "withdrawal_failed"
  | "reconciliation_adjustment"
  | "claim_payout";

export interface LedgerJournal {
  id: string;
  kind: LedgerJournalKind;
  reference: string;
  createdAt: string;
  metadata: Record<string, string>;
}

export interface LedgerEntry {
  id: string;
  journalId: string;
  accountCode: string;
  direction: "debit" | "credit";
  amount: MoneyAtoms;
  currency: string;
}

export interface LedgerBalanceDelta {
  accountCode: string;
  currency: string;
  delta: MoneyAtoms;
}

export interface LedgerMutationResult {
  journal: LedgerJournal;
  entries: readonly LedgerEntry[];
  balanceDeltas: readonly LedgerBalanceDelta[];
}
