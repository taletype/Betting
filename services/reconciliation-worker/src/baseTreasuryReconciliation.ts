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

type WithdrawalStatus = "requested" | "completed" | "failed";

interface BaseWithdrawalRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  status: WithdrawalStatus;
  tx_hash: string | null;
  amount: bigint;
  currency: string;
  requested_journal_id: string;
  completed_journal_id: string | null;
  failed_journal_id: string | null;
  processed_by: string | null;
  processed_at: string | null;
  failure_reason: string | null;
}

interface JournalEntryRow {
  [key: string]: unknown;
  journal_id: string;
  journal_kind: string;
  account_code: string | null;
  direction: "debit" | "credit" | null;
  amount: bigint | null;
  currency: string | null;
}

interface ReconciliationJournalSnapshot {
  kind: string;
  entriesByKey: Map<string, bigint>;
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

const buildAvailableFundsAccountCode = (userId: string): string => `user:${userId}:funds:available`;
const buildPendingWithdrawalAccountCode = (userId: string): string => `user:${userId}:funds:withdrawal_pending`;

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

const getBaseWithdrawals = (db: DatabaseExecutor): Promise<BaseWithdrawalRow[]> =>
  runQueryWithMissingTableFallback<BaseWithdrawalRow>(
    db,
    `
      select
        id,
        user_id,
        status,
        tx_hash,
        amount,
        currency,
        requested_journal_id,
        completed_journal_id,
        failed_journal_id,
        processed_by,
        processed_at,
        failure_reason
      from public.withdrawals
      where chain = 'base'
    `,
  );

const getWithdrawalLedgerState = async (
  db: DatabaseExecutor,
  journalIds: readonly string[],
): Promise<Map<string, ReconciliationJournalSnapshot>> => {
  if (journalIds.length === 0) {
    return new Map();
  }

  const rows = await db.query<JournalEntryRow>(
    `
      select
        lj.id as journal_id,
        lj.journal_kind,
        le.account_code,
        le.direction,
        le.amount,
        le.currency
      from public.ledger_journals lj
      left join public.ledger_entries le on le.journal_id = lj.id
      where lj.id = any($1::uuid[])
    `,
    [journalIds],
  );

  const snapshots = new Map<string, ReconciliationJournalSnapshot>();
  for (const row of rows) {
    const existing = snapshots.get(row.journal_id) ?? {
      kind: row.journal_kind,
      entriesByKey: new Map<string, bigint>(),
    };

    if (row.account_code && row.direction && row.currency && row.amount !== null) {
      const entryKey = `${row.account_code}|${row.direction}|${row.currency}`;
      existing.entriesByKey.set(entryKey, (existing.entriesByKey.get(entryKey) ?? 0n) + row.amount);
    }

    snapshots.set(row.journal_id, existing);
  }

  return snapshots;
};

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
    details: `${input.entityType} ${input.entityId} tx=${input.txHash} monitor_state=${input.state} confirmations=${input.confirmations}`,
    metadata: {
      entityType: input.entityType,
      entityId: input.entityId,
      txHash: input.txHash,
      monitoringState: input.state,
      confirmations: input.confirmations,
    },
  });
};

const recordMismatch = (
  failures: ReconciliationFailure[],
  input: {
    check: string;
    withdrawalId: string;
    details: string;
    metadata?: Record<string, unknown>;
  },
): void => {
  failures.push({
    check: input.check,
    details: `withdrawal ${input.withdrawalId}: ${input.details}`,
    metadata: {
      withdrawalId: input.withdrawalId,
      ...(input.metadata ?? {}),
    },
  });
};

const assertJournalKind = (
  failures: ReconciliationFailure[],
  input: {
    check: string;
    withdrawalId: string;
    journalLabel: "requested_journal_id" | "completed_journal_id" | "failed_journal_id";
    journalId: string | null;
    expectedKind: string;
    journalsById: Map<string, ReconciliationJournalSnapshot>;
  },
): void => {
  if (!input.journalId) {
    recordMismatch(failures, {
      check: input.check,
      withdrawalId: input.withdrawalId,
      details: `missing ${input.journalLabel}`,
      metadata: { journalLabel: input.journalLabel },
    });
    return;
  }

  const journal = input.journalsById.get(input.journalId);
  if (!journal) {
    recordMismatch(failures, {
      check: input.check,
      withdrawalId: input.withdrawalId,
      details: `${input.journalLabel} ${input.journalId} not found in ledger_journals`,
      metadata: { journalLabel: input.journalLabel, journalId: input.journalId },
    });
    return;
  }

  if (journal.kind !== input.expectedKind) {
    recordMismatch(failures, {
      check: input.check,
      withdrawalId: input.withdrawalId,
      details: `${input.journalLabel} ${input.journalId} has journal_kind=${journal.kind}, expected=${input.expectedKind}`,
      metadata: {
        journalLabel: input.journalLabel,
        journalId: input.journalId,
        expectedKind: input.expectedKind,
        actualKind: journal.kind,
      },
    });
  }
};

const assertJournalEntries = (
  failures: ReconciliationFailure[],
  input: {
    check: string;
    withdrawalId: string;
    journalLabel: "requested_journal_id" | "completed_journal_id" | "failed_journal_id";
    journalId: string | null;
    journalsById: Map<string, ReconciliationJournalSnapshot>;
    expectedEntries: ReadonlyArray<{ accountCode: string; direction: "debit" | "credit"; currency: string; amount: bigint }>;
  },
): void => {
  if (!input.journalId) {
    return;
  }

  const journal = input.journalsById.get(input.journalId);
  if (!journal) {
    return;
  }

  const expected = new Map<string, bigint>();
  for (const entry of input.expectedEntries) {
    const key = `${entry.accountCode}|${entry.direction}|${entry.currency}`;
    expected.set(key, (expected.get(key) ?? 0n) + entry.amount);
  }

  for (const [entryKey, expectedAmount] of expected.entries()) {
    const actualAmount = journal.entriesByKey.get(entryKey) ?? 0n;
    if (actualAmount !== expectedAmount) {
      recordMismatch(failures, {
        check: input.check,
        withdrawalId: input.withdrawalId,
        details: `${input.journalLabel} ${input.journalId} entry ${entryKey} amount=${actualAmount} expected=${expectedAmount}`,
        metadata: {
          journalLabel: input.journalLabel,
          journalId: input.journalId,
          entryKey,
          actualAmount: actualAmount.toString(),
          expectedAmount: expectedAmount.toString(),
        },
      });
    }
  }
};

export const runBaseTreasuryReconciliation = async (input: {
  db: DatabaseExecutor;
  chainMonitor: ChainTxMonitor;
  minConfirmations: number;
}): Promise<BaseTreasuryReconciliationReport> => {
  const [deposits, withdrawals] = await Promise.all([getBaseDeposits(input.db), getBaseWithdrawals(input.db)]);

  const allJournalIds = Array.from(
    new Set(
      withdrawals.flatMap((row) => [row.requested_journal_id, row.completed_journal_id, row.failed_journal_id].filter(Boolean)),
    ),
  ) as string[];

  const journalsById = await getWithdrawalLedgerState(input.db, allJournalIds);
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
    assertJournalKind(failures, {
      check: "base_withdrawal_requested_journal_kind_mismatch",
      withdrawalId: withdrawal.id,
      journalLabel: "requested_journal_id",
      journalId: withdrawal.requested_journal_id,
      expectedKind: "withdrawal_requested",
      journalsById,
    });

    assertJournalEntries(failures, {
      check: "base_withdrawal_requested_ledger_mismatch",
      withdrawalId: withdrawal.id,
      journalLabel: "requested_journal_id",
      journalId: withdrawal.requested_journal_id,
      journalsById,
      expectedEntries: [
        {
          accountCode: buildPendingWithdrawalAccountCode(withdrawal.user_id),
          direction: "debit",
          currency: withdrawal.currency,
          amount: withdrawal.amount,
        },
        {
          accountCode: buildAvailableFundsAccountCode(withdrawal.user_id),
          direction: "credit",
          currency: withdrawal.currency,
          amount: withdrawal.amount,
        },
      ],
    });

    if (withdrawal.status === "completed") {
      if (!withdrawal.tx_hash) {
        recordMismatch(failures, {
          check: "base_withdrawal_missing_tx_hash",
          withdrawalId: withdrawal.id,
          details: "status=completed but tx_hash is null",
        });
      }

      assertJournalKind(failures, {
        check: "base_withdrawal_completed_journal_kind_mismatch",
        withdrawalId: withdrawal.id,
        journalLabel: "completed_journal_id",
        journalId: withdrawal.completed_journal_id,
        expectedKind: "withdrawal_completed",
        journalsById,
      });

      assertJournalEntries(failures, {
        check: "base_withdrawal_completed_ledger_mismatch",
        withdrawalId: withdrawal.id,
        journalLabel: "completed_journal_id",
        journalId: withdrawal.completed_journal_id,
        journalsById,
        expectedEntries: [
          {
            accountCode: "platform:withdrawals:base_usdc",
            direction: "debit",
            currency: withdrawal.currency,
            amount: withdrawal.amount,
          },
          {
            accountCode: buildPendingWithdrawalAccountCode(withdrawal.user_id),
            direction: "credit",
            currency: withdrawal.currency,
            amount: withdrawal.amount,
          },
        ],
      });

      if (!withdrawal.processed_at || !withdrawal.processed_by) {
        recordMismatch(failures, {
          check: "base_withdrawal_admin_processing_mismatch",
          withdrawalId: withdrawal.id,
          details: `status=completed requires processed_at and processed_by (processed_at=${withdrawal.processed_at}, processed_by=${withdrawal.processed_by})`,
        });
      }

      if (withdrawal.tx_hash) {
        const tx = await input.chainMonitor.monitorTransaction({
          txHash: withdrawal.tx_hash,
          minConfirmations: input.minConfirmations,
        });

        if (tx.state !== "confirmed") {
          recordStateMismatch(failures, {
            check: "base_withdrawal_monitoring_state_mismatch",
            entityType: "withdrawal",
            entityId: withdrawal.id,
            txHash: withdrawal.tx_hash,
            state: tx.state,
            confirmations: tx.confirmations,
          });
        }
      }
    }

    if (withdrawal.status === "failed") {
      if (withdrawal.tx_hash) {
        recordMismatch(failures, {
          check: "base_withdrawal_failed_tx_hash_present",
          withdrawalId: withdrawal.id,
          details: `status=failed but tx_hash is set (${withdrawal.tx_hash})`,
        });
      }

      assertJournalKind(failures, {
        check: "base_withdrawal_failed_journal_kind_mismatch",
        withdrawalId: withdrawal.id,
        journalLabel: "failed_journal_id",
        journalId: withdrawal.failed_journal_id,
        expectedKind: "withdrawal_failed",
        journalsById,
      });

      assertJournalEntries(failures, {
        check: "base_withdrawal_failed_reversal_mismatch",
        withdrawalId: withdrawal.id,
        journalLabel: "failed_journal_id",
        journalId: withdrawal.failed_journal_id,
        journalsById,
        expectedEntries: [
          {
            accountCode: buildAvailableFundsAccountCode(withdrawal.user_id),
            direction: "debit",
            currency: withdrawal.currency,
            amount: withdrawal.amount,
          },
          {
            accountCode: buildPendingWithdrawalAccountCode(withdrawal.user_id),
            direction: "credit",
            currency: withdrawal.currency,
            amount: withdrawal.amount,
          },
        ],
      });

      if (!withdrawal.processed_at || !withdrawal.processed_by || !withdrawal.failure_reason) {
        recordMismatch(failures, {
          check: "base_withdrawal_admin_processing_mismatch",
          withdrawalId: withdrawal.id,
          details: `status=failed requires processed_at, processed_by, failure_reason (processed_at=${withdrawal.processed_at}, processed_by=${withdrawal.processed_by}, failure_reason=${withdrawal.failure_reason})`,
        });
      }
    }

    if (withdrawal.status === "requested") {
      if (withdrawal.tx_hash || withdrawal.processed_at || withdrawal.processed_by || withdrawal.failure_reason) {
        recordMismatch(failures, {
          check: "base_withdrawal_requested_state_mismatch",
          withdrawalId: withdrawal.id,
          details: "status=requested must not have tx_hash, processed_at, processed_by, or failure_reason",
          metadata: {
            txHash: withdrawal.tx_hash,
            processedAt: withdrawal.processed_at,
            processedBy: withdrawal.processed_by,
            failureReason: withdrawal.failure_reason,
          },
        });
      }
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
  const outflowAmount = withdrawals.filter((row) => row.status === "completed").reduce((sum, row) => sum + row.amount, 0n);

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
