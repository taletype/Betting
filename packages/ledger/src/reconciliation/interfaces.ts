import type { Money } from "@bet/domain";

export interface ReconciliationBalance {
  accountCode: string;
  currency: string;
  expected: Money;
  actual: Money;
}

export interface ReconciliationResult {
  checkedAt: string;
  balances: ReconciliationBalance[];
  mismatches: ReconciliationBalance[];
}

export interface LedgerReconciliationProvider {
  reconcile(): Promise<ReconciliationResult>;
}
