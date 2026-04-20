import type { DatabaseExecutor, DatabaseTransaction } from "@bet/db";

export type WithdrawalStatus = "requested" | "completed" | "failed";

export interface WithdrawalRecord {
  id: string;
  userId: string;
  chain: "base";
  amount: bigint;
  currency: string;
  destinationAddress: string;
  status: WithdrawalStatus;
  txHash: string | null;
  failureReason: string | null;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WithdrawalRow {
  id: string;
  user_id: string;
  chain: "base";
  amount: bigint;
  currency: string;
  destination_address: string;
  status: WithdrawalStatus;
  tx_hash: string | null;
  failure_reason: string | null;
  processed_by: string | null;
  processed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface BalanceRow {
  available: bigint;
}

export interface LedgerEntryShape {
  accountCode: string;
  direction: "debit" | "credit";
  amount: bigint;
  currency: string;
}

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const toNullableIso = (value: Date | string | null): string | null => (value ? toIso(value) : null);

const mapWithdrawal = (row: WithdrawalRow): WithdrawalRecord => ({
  id: row.id,
  userId: row.user_id,
  chain: row.chain,
  amount: row.amount,
  currency: row.currency,
  destinationAddress: row.destination_address,
  status: row.status,
  txHash: row.tx_hash,
  failureReason: row.failure_reason,
  processedBy: row.processed_by,
  processedAt: toNullableIso(row.processed_at),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const buildAvailableFundsAccountCode = (userId: string): string => `user:${userId}:funds:available`;
const buildPendingWithdrawalAccountCode = (userId: string): string => `user:${userId}:funds:withdrawal_pending`;

export const getAvailableBalance = async (
  executor: DatabaseExecutor,
  input: { userId: string; currency: string },
): Promise<bigint> => {
  const [row] = await executor.query<BalanceRow>(
    `
      select coalesce(
        sum(
          case
            when direction = 'debit' then amount
            when direction = 'credit' then -amount
            else 0
          end
        )::bigint,
        0::bigint
      ) as available
      from public.ledger_entries
      where account_code = $1
        and currency = $2
    `,
    [buildAvailableFundsAccountCode(input.userId), input.currency],
  );

  return row?.available ?? 0n;
};

export const buildWithdrawalRequestedLedgerEntries = (input: {
  userId: string;
  amount: bigint;
  currency: string;
}): readonly LedgerEntryShape[] => [
  {
    accountCode: buildPendingWithdrawalAccountCode(input.userId),
    direction: "debit",
    amount: input.amount,
    currency: input.currency,
  },
  {
    accountCode: buildAvailableFundsAccountCode(input.userId),
    direction: "credit",
    amount: input.amount,
    currency: input.currency,
  },
];

export const buildWithdrawalCompletedLedgerEntries = (input: {
  userId: string;
  amount: bigint;
  currency: string;
}): readonly LedgerEntryShape[] => [
  {
    accountCode: "platform:withdrawals:base_usdc",
    direction: "debit",
    amount: input.amount,
    currency: input.currency,
  },
  {
    accountCode: buildPendingWithdrawalAccountCode(input.userId),
    direction: "credit",
    amount: input.amount,
    currency: input.currency,
  },
];

export const buildWithdrawalFailedLedgerEntries = (input: {
  userId: string;
  amount: bigint;
  currency: string;
}): readonly LedgerEntryShape[] => [
  {
    accountCode: buildAvailableFundsAccountCode(input.userId),
    direction: "debit",
    amount: input.amount,
    currency: input.currency,
  },
  {
    accountCode: buildPendingWithdrawalAccountCode(input.userId),
    direction: "credit",
    amount: input.amount,
    currency: input.currency,
  },
];

const insertJournalWithEntries = async (
  transaction: DatabaseTransaction,
  input: {
    journalId: string;
    journalKind: "withdrawal_requested" | "withdrawal_completed" | "withdrawal_failed";
    reference: string;
    metadata: Record<string, unknown>;
    entries: readonly LedgerEntryShape[];
  },
): Promise<void> => {
  await transaction.query(
    `
      insert into public.ledger_journals (
        id,
        journal_kind,
        reference,
        metadata,
        created_at
      ) values (
        $1::uuid,
        $2,
        $3,
        $4::jsonb,
        now()
      )
    `,
    [input.journalId, input.journalKind, input.reference, JSON.stringify(input.metadata)],
  );

  await transaction.query(
    `
      insert into public.ledger_entries (
        journal_id,
        account_code,
        direction,
        amount,
        currency,
        created_at
      ) values
        ($1::uuid, $2, $3, $4, $5, now()),
        ($1::uuid, $6, $7, $8, $9, now())
    `,
    [
      input.journalId,
      input.entries[0]?.accountCode ?? "",
      input.entries[0]?.direction ?? "debit",
      input.entries[0]?.amount ?? 0n,
      input.entries[0]?.currency ?? "USDC",
      input.entries[1]?.accountCode ?? "",
      input.entries[1]?.direction ?? "credit",
      input.entries[1]?.amount ?? 0n,
      input.entries[1]?.currency ?? "USDC",
    ],
  );
};

export const insertWithdrawalRequest = async (
  transaction: DatabaseTransaction,
  input: {
    userId: string;
    amount: bigint;
    currency: string;
    destinationAddress: string;
    requestedJournalId: string;
  },
): Promise<WithdrawalRecord> => {
  const [row] = await transaction.query<WithdrawalRow>(
    `
      insert into public.withdrawals (
        user_id,
        chain,
        amount,
        currency,
        destination_address,
        status,
        requested_journal_id,
        metadata,
        created_at,
        updated_at
      ) values (
        $1::uuid,
        'base',
        $2,
        $3,
        $4,
        'requested',
        $5::uuid,
        '{}'::jsonb,
        now(),
        now()
      )
      returning
        id,
        user_id,
        chain,
        amount,
        currency,
        destination_address,
        status,
        tx_hash,
        failure_reason,
        processed_by,
        processed_at,
        created_at,
        updated_at
    `,
    [input.userId, input.amount, input.currency, input.destinationAddress, input.requestedJournalId],
  );

  if (!row) {
    throw new Error("failed to insert withdrawal");
  }

  return mapWithdrawal(row);
};

export const insertWithdrawalRequestedJournal = async (
  transaction: DatabaseTransaction,
  input: {
    journalId: string;
    withdrawalId: string;
    userId: string;
    currency: string;
    amount: bigint;
    destinationAddress: string;
  },
): Promise<void> => {
  await insertJournalWithEntries(transaction, {
    journalId: input.journalId,
    journalKind: "withdrawal_requested",
    reference: `withdrawal:${input.withdrawalId}:requested`,
    metadata: {
      withdrawalId: input.withdrawalId,
      destinationAddress: input.destinationAddress,
    },
    entries: buildWithdrawalRequestedLedgerEntries({
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
    }),
  });
};

export const getWithdrawalForUpdate = async (
  transaction: DatabaseTransaction,
  withdrawalId: string,
): Promise<WithdrawalRecord | null> => {
  const [row] = await transaction.query<WithdrawalRow>(
    `
      select
        id,
        user_id,
        chain,
        amount,
        currency,
        destination_address,
        status,
        tx_hash,
        failure_reason,
        processed_by,
        processed_at,
        created_at,
        updated_at
      from public.withdrawals
      where id = $1::uuid
      limit 1
      for update
    `,
    [withdrawalId],
  );

  return row ? mapWithdrawal(row) : null;
};

export const markWithdrawalCompleted = async (
  transaction: DatabaseTransaction,
  input: { withdrawalId: string; adminUserId: string; txHash: string; completedJournalId: string },
): Promise<WithdrawalRecord> => {
  const [row] = await transaction.query<WithdrawalRow>(
    `
      update public.withdrawals
      set
        status = 'completed',
        processed_by = $2::uuid,
        processed_at = now(),
        tx_hash = $3,
        completed_journal_id = $4::uuid,
        updated_at = now()
      where id = $1::uuid
      returning
        id,
        user_id,
        chain,
        amount,
        currency,
        destination_address,
        status,
        tx_hash,
        failure_reason,
        processed_by,
        processed_at,
        created_at,
        updated_at
    `,
    [input.withdrawalId, input.adminUserId, input.txHash, input.completedJournalId],
  );

  if (!row) {
    throw new Error("failed to complete withdrawal");
  }

  return mapWithdrawal(row);
};

export const markWithdrawalFailed = async (
  transaction: DatabaseTransaction,
  input: { withdrawalId: string; adminUserId: string; reason: string; failedJournalId: string },
): Promise<WithdrawalRecord> => {
  const [row] = await transaction.query<WithdrawalRow>(
    `
      update public.withdrawals
      set
        status = 'failed',
        processed_by = $2::uuid,
        processed_at = now(),
        failure_reason = $3,
        failed_journal_id = $4::uuid,
        updated_at = now()
      where id = $1::uuid
      returning
        id,
        user_id,
        chain,
        amount,
        currency,
        destination_address,
        status,
        tx_hash,
        failure_reason,
        processed_by,
        processed_at,
        created_at,
        updated_at
    `,
    [input.withdrawalId, input.adminUserId, input.reason, input.failedJournalId],
  );

  if (!row) {
    throw new Error("failed to fail withdrawal");
  }

  return mapWithdrawal(row);
};

export const insertWithdrawalCompletedJournal = async (
  transaction: DatabaseTransaction,
  input: {
    journalId: string;
    withdrawalId: string;
    userId: string;
    currency: string;
    amount: bigint;
    txHash: string;
  },
): Promise<void> => {
  await insertJournalWithEntries(transaction, {
    journalId: input.journalId,
    journalKind: "withdrawal_completed",
    reference: `withdrawal:${input.withdrawalId}:completed`,
    metadata: {
      withdrawalId: input.withdrawalId,
      txHash: input.txHash,
    },
    entries: buildWithdrawalCompletedLedgerEntries({
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
    }),
  });
};

export const insertWithdrawalFailedJournal = async (
  transaction: DatabaseTransaction,
  input: {
    journalId: string;
    withdrawalId: string;
    userId: string;
    currency: string;
    amount: bigint;
    reason: string;
  },
): Promise<void> => {
  await insertJournalWithEntries(transaction, {
    journalId: input.journalId,
    journalKind: "withdrawal_failed",
    reference: `withdrawal:${input.withdrawalId}:failed`,
    metadata: {
      withdrawalId: input.withdrawalId,
      reason: input.reason,
    },
    entries: buildWithdrawalFailedLedgerEntries({
      userId: input.userId,
      amount: input.amount,
      currency: input.currency,
    }),
  });
};

export const listWithdrawalsForUser = async (
  executor: DatabaseExecutor,
  userId: string,
): Promise<WithdrawalRecord[]> => {
  const rows = await executor.query<WithdrawalRow>(
    `
      select
        id,
        user_id,
        chain,
        amount,
        currency,
        destination_address,
        status,
        tx_hash,
        failure_reason,
        processed_by,
        processed_at,
        created_at,
        updated_at
      from public.withdrawals
      where user_id = $1::uuid
      order by created_at desc, id desc
    `,
    [userId],
  );

  return rows.map((row) => mapWithdrawal(row));
};

export const listRequestedWithdrawals = async (executor: DatabaseExecutor): Promise<WithdrawalRecord[]> => {
  const rows = await executor.query<WithdrawalRow>(
    `
      select
        id,
        user_id,
        chain,
        amount,
        currency,
        destination_address,
        status,
        tx_hash,
        failure_reason,
        processed_by,
        processed_at,
        created_at,
        updated_at
      from public.withdrawals
      where status = 'requested'
      order by created_at asc, id asc
    `,
  );

  return rows.map((row) => mapWithdrawal(row));
};
