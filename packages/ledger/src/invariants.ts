import { assertNonNegative, invariant } from "@bet/domain";

import type { LedgerEntry } from "./journals/types";

export const assertLedgerAmountNonNegative = (amount: bigint, label: string): void => {
  assertNonNegative(amount, label);
};

export const assertBalancedJournalEntries = (entries: readonly LedgerEntry[]): void => {
  invariant(entries.length > 0, "journal must have at least one entry");

  const totalsByCurrency = new Map<string, { debit: bigint; credit: bigint }>();

  for (const entry of entries) {
    assertLedgerAmountNonNegative(entry.amount, "entry amount");

    const current = totalsByCurrency.get(entry.currency) ?? { debit: 0n, credit: 0n };
    if (entry.direction === "debit") {
      current.debit += entry.amount;
    } else {
      current.credit += entry.amount;
    }

    totalsByCurrency.set(entry.currency, current);
  }

  for (const [currency, totals] of totalsByCurrency) {
    invariant(
      totals.debit === totals.credit,
      `journal entries must balance for currency ${currency}`,
    );
  }
};
