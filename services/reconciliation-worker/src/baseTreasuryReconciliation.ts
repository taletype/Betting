import type { DatabaseExecutor } from "@bet/db";
import type { ChainTxMonitor, TxMonitoringState } from "@bet/chain";

interface BaseDepositRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  tx_hash: string;
  amount: bigint;
  currency: string;
}

interface BaseWithdrawalRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  tx_hash: string | null;
  amount: bigint;
  currency: string;
}

export interface ReconciliationFailure {
  check: string;
  details: string;
  metadata?: Record<string, unknown>;
}

export interface BaseTreasuryReconciliationReport {
  generatedAt: string;
  chain: "base";
  policy: {
    minConfirmations: number;
  };
  counts: {
    depositsChecked: number;
    withdrawalsChecked: number;
    failures: number;
  };
  treasurySummary: {
    inflowAmount: bigint;
    outflowAmount: bigint;
    netAmount: bigint;
    currency: string;
  };
  failures: ReconciliationFailure[];
}

const runQueryWithMissingTableFallback = async <T extends Record<string, unknown>>(
  db: DatabaseExecutor,
  statement: string,
): Promise<T[]> => {
  try {
    return await db.query<T>(statement);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "42P01") {
      return [];
    }

    throw error;
  }
};

const getBaseDeposits = (db: DatabaseExecutor): Promise<BaseDepositRow[]> =>
  db.query<BaseDepositRow>(
    `
      select
        id,
        user_id,
        tx_hash,
        amount,
        currency
      from public.chain_deposits
      where chain = 'base'
        and tx_status = 'confirmed'
    `,
  );

const getCompletedBaseWithdrawals = (db: DatabaseExecutor): Promise<BaseWithdrawalRow[]> =>
  runQueryWithMissingTableFallback<BaseWithdrawalRow>(
    db,
    `
      select
        id,
        user_id,
        tx_hash,
        amount,
        currency
      from public.withdrawal_requests
      where chain = 'base'
        and status = 'completed'
    `,
  );

const recordStateMismatch = (
  failures: ReconciliationFailure[],
  input: {
    check: string;
    entityType: "deposit" | "withdrawal";
    entityId: string;
    txHash: string;
    state: TxMonitoringState;
    confirmations: number;
  },
): void => {
  failures.push({
    check: input.check,
    details: `${input.entityType} ${input.entityId} tx=${input.txHash} state=${input.state}`,
    metadata: {
      entityType: input.entityType,
      entityId: input.entityId,
      txHash: input.txHash,
      monitoringState: input.state,
      confirmations: input.confirmations,
    },
  });
};

export const runBaseTreasuryReconciliation = async (input: {
  db: DatabaseExecutor;
  chainMonitor: ChainTxMonitor;
  minConfirmations: number;
}): Promise<BaseTreasuryReconciliationReport> => {
  const [deposits, withdrawals] = await Promise.all([
    getBaseDeposits(input.db),
    getCompletedBaseWithdrawals(input.db),
  ]);

  const failures: ReconciliationFailure[] = [];

  for (const deposit of deposits) {
    const tx = await input.chainMonitor.monitorTransaction({
      txHash: deposit.tx_hash,
      minConfirmations: input.minConfirmations,
    });

    if (tx.state !== "confirmed") {
      recordStateMismatch(failures, {
        check: "base_deposit_tx_not_finalized",
        entityType: "deposit",
        entityId: deposit.id,
        txHash: deposit.tx_hash,
        state: tx.state,
        confirmations: tx.confirmations,
      });
    }
  }

  for (const withdrawal of withdrawals) {
    if (!withdrawal.tx_hash) {
      failures.push({
        check: "base_withdrawal_missing_tx_hash",
        details: `withdrawal ${withdrawal.id} marked completed without tx hash`,
        metadata: {
          entityType: "withdrawal",
          entityId: withdrawal.id,
        },
      });
      continue;
    }

    const tx = await input.chainMonitor.monitorTransaction({
      txHash: withdrawal.tx_hash,
      minConfirmations: input.minConfirmations,
    });

    if (tx.state !== "confirmed") {
      recordStateMismatch(failures, {
        check: "base_withdrawal_tx_not_confirmed",
        entityType: "withdrawal",
        entityId: withdrawal.id,
        txHash: withdrawal.tx_hash,
        state: tx.state,
        confirmations: tx.confirmations,
      });
    }
  }

  const txOwners = new Map<string, string[]>();
  for (const deposit of deposits) {
    const owners = txOwners.get(deposit.tx_hash) ?? [];
    owners.push(`deposit:${deposit.id}`);
    txOwners.set(deposit.tx_hash, owners);
  }

  for (const withdrawal of withdrawals) {
    if (!withdrawal.tx_hash) {
      continue;
    }

    const owners = txOwners.get(withdrawal.tx_hash) ?? [];
    owners.push(`withdrawal:${withdrawal.id}`);
    txOwners.set(withdrawal.tx_hash, owners);
  }

  for (const [txHash, owners] of txOwners.entries()) {
    if (owners.length > 1) {
      failures.push({
        check: "base_duplicate_tx_hash_usage",
        details: `tx hash ${txHash} reused by ${owners.join(",")}`,
        metadata: {
          txHash,
          owners,
        },
      });
    }
  }

  const inflowAmount = deposits.reduce((sum, row) => sum + row.amount, 0n);
  const outflowAmount = withdrawals.reduce((sum, row) => sum + row.amount, 0n);

  return {
    generatedAt: new Date().toISOString(),
    chain: "base",
    policy: {
      minConfirmations: input.minConfirmations,
    },
    counts: {
      depositsChecked: deposits.length,
      withdrawalsChecked: withdrawals.length,
      failures: failures.length,
    },
    treasurySummary: {
      inflowAmount,
      outflowAmount,
      netAmount: inflowAmount - outflowAmount,
      currency: "USDC",
    },
    failures,
  };
};
