import type { DatabaseExecutor, DatabaseTransaction } from "@bet/db";

export interface DepositRecord {
  id: string;
  userId: string;
  chain: "base";
  txHash: string;
  txSender: string;
  txRecipient: string;
  tokenAddress: string;
  amount: bigint;
  currency: string;
  txStatus: "confirmed" | "rejected";
  blockNumber: bigint;
  journalId: string | null;
  createdAt: string;
  verifiedAt: string;
}

interface DepositRow {
  id: string;
  user_id: string;
  chain: "base";
  tx_hash: string;
  tx_sender: string;
  tx_recipient: string;
  token_address: string;
  amount: bigint;
  currency: string;
  tx_status: "confirmed" | "rejected";
  block_number: bigint;
  journal_id: string | null;
  created_at: Date | string;
  verified_at: Date | string;
}

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapDeposit = (row: DepositRow): DepositRecord => ({
  id: row.id,
  userId: row.user_id,
  chain: row.chain,
  txHash: row.tx_hash,
  txSender: row.tx_sender,
  txRecipient: row.tx_recipient,
  tokenAddress: row.token_address,
  amount: row.amount,
  currency: row.currency,
  txStatus: row.tx_status,
  blockNumber: row.block_number,
  journalId: row.journal_id,
  createdAt: toIso(row.created_at),
  verifiedAt: toIso(row.verified_at),
});

export const getDepositByTxHash = async (
  executor: DatabaseExecutor,
  input: { chain: "base"; txHash: string },
): Promise<DepositRecord | null> => {
  const [row] = await executor.query<DepositRow>(
    `
      select
        id,
        user_id,
        chain,
        tx_hash,
        tx_sender,
        tx_recipient,
        token_address,
        amount,
        currency,
        tx_status,
        block_number,
        journal_id,
        created_at,
        verified_at
      from public.chain_deposits
      where chain = $1
        and tx_hash = $2
      limit 1
    `,
    [input.chain, input.txHash],
  );

  return row ? mapDeposit(row) : null;
};

export const insertDepositVerificationAttempt = async (
  transaction: DatabaseTransaction,
  input: {
    userId: string;
    txHash: string;
    status: "accepted" | "rejected";
    reason: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> => {
  await transaction.query(
    `
      insert into public.deposit_verification_attempts (
        user_id,
        tx_hash,
        status,
        reason,
        metadata,
        created_at
      ) values (
        $1::uuid,
        $2,
        $3,
        $4,
        $5::jsonb,
        now()
      )
    `,
    [input.userId, input.txHash, input.status, input.reason, JSON.stringify(input.metadata ?? {})],
  );
};

export const insertDepositRecord = async (
  transaction: DatabaseTransaction,
  input: {
    userId: string;
    txHash: string;
    txSender: string;
    txRecipient: string;
    tokenAddress: string;
    amount: bigint;
    currency: string;
    blockNumber: bigint;
    journalId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<DepositRecord> => {
  const [row] = await transaction.query<DepositRow>(
    `
      insert into public.chain_deposits (
        user_id,
        chain,
        tx_hash,
        tx_sender,
        tx_recipient,
        token_address,
        amount,
        currency,
        block_number,
        tx_status,
        journal_id,
        metadata,
        created_at,
        verified_at
      ) values (
        $1::uuid,
        'base',
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        'confirmed',
        $9::uuid,
        $10::jsonb,
        now(),
        now()
      )
      returning
        id,
        user_id,
        chain,
        tx_hash,
        tx_sender,
        tx_recipient,
        token_address,
        amount,
        currency,
        tx_status,
        block_number,
        journal_id,
        created_at,
        verified_at
    `,
    [
      input.userId,
      input.txHash,
      input.txSender,
      input.txRecipient,
      input.tokenAddress,
      input.amount,
      input.currency,
      input.blockNumber,
      input.journalId,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  if (!row) {
    throw new Error("failed to insert deposit record");
  }

  return mapDeposit(row);
};


export interface DepositLedgerEntryShape {
  accountCode: string;
  direction: "debit" | "credit";
  amount: bigint;
  currency: string;
}

export const buildDepositLedgerEntries = (input: {
  userId: string;
  amount: bigint;
  currency: string;
}): readonly DepositLedgerEntryShape[] => [
  {
    accountCode: `user:${input.userId}:funds:available`,
    direction: "debit",
    amount: input.amount,
    currency: input.currency,
  },
  {
    accountCode: "platform:treasury:base_usdc",
    direction: "credit",
    amount: input.amount,
    currency: input.currency,
  },
];

export const insertDepositJournal = async (
  transaction: DatabaseTransaction,
  input: {
    journalId: string;
    reference: string;
    userId: string;
    currency: string;
    amount: bigint;
    metadata: Record<string, string>;
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
        'deposit_confirmed',
        $2,
        $3::jsonb,
        now()
      )
    `,
    [input.journalId, input.reference, JSON.stringify(input.metadata)],
  );

  const entries = buildDepositLedgerEntries({
    userId: input.userId,
    amount: input.amount,
    currency: input.currency,
  });

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
      entries[0]?.accountCode ?? '',
      entries[0]?.direction ?? 'debit',
      entries[0]?.amount ?? 0n,
      entries[0]?.currency ?? input.currency,
      entries[1]?.accountCode ?? '',
      entries[1]?.direction ?? 'credit',
      entries[1]?.amount ?? 0n,
      entries[1]?.currency ?? input.currency,
    ],
  );
};

export const listDepositsForUser = async (
  executor: DatabaseExecutor,
  userId: string,
): Promise<DepositRecord[]> => {
  const rows = await executor.query<DepositRow>(
    `
      select
        id,
        user_id,
        chain,
        tx_hash,
        tx_sender,
        tx_recipient,
        token_address,
        amount,
        currency,
        tx_status,
        block_number,
        journal_id,
        created_at,
        verified_at
      from public.chain_deposits
      where user_id = $1::uuid
      order by created_at desc, id desc
    `,
    [userId],
  );

  return rows.map((row) => mapDeposit(row));
};
