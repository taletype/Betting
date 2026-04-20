import type { DatabaseExecutor, DatabaseTransaction } from "@bet/db";

export interface LinkedWallet {
  id: string;
  userId: string;
  chain: "base";
  walletAddress: string;
  signature: string;
  signedMessage: string;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface LinkedWalletRow {
  id: string;
  user_id: string;
  chain: "base";
  wallet_address: string;
  signature: string;
  signed_message: string;
  verified_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapLinkedWallet = (row: LinkedWalletRow): LinkedWallet => ({
  id: row.id,
  userId: row.user_id,
  chain: row.chain,
  walletAddress: row.wallet_address,
  signature: row.signature,
  signedMessage: row.signed_message,
  verifiedAt: toIso(row.verified_at),
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

export const getLinkedWalletForUser = async (
  executor: DatabaseExecutor,
  userId: string,
): Promise<LinkedWallet | null> => {
  const [row] = await executor.query<LinkedWalletRow>(
    `
      select
        id,
        user_id,
        chain,
        wallet_address,
        signature,
        signed_message,
        verified_at,
        created_at,
        updated_at
      from public.linked_wallets
      where user_id = $1::uuid
      limit 1
    `,
    [userId],
  );

  return row ? mapLinkedWallet(row) : null;
};

export const upsertLinkedWallet = async (
  transaction: DatabaseTransaction,
  input: {
    userId: string;
    walletAddress: string;
    signature: string;
    signedMessage: string;
    verifiedAt: string;
  },
): Promise<LinkedWallet> => {
  const [row] = await transaction.query<LinkedWalletRow>(
    `
      insert into public.linked_wallets (
        user_id,
        chain,
        wallet_address,
        signature,
        signed_message,
        verified_at,
        metadata,
        created_at,
        updated_at
      ) values (
        $1::uuid,
        'base',
        $2,
        $3,
        $4,
        $5::timestamptz,
        '{}'::jsonb,
        $5::timestamptz,
        $5::timestamptz
      )
      on conflict (user_id)
      do update set
        wallet_address = excluded.wallet_address,
        signature = excluded.signature,
        signed_message = excluded.signed_message,
        verified_at = excluded.verified_at,
        updated_at = excluded.updated_at
      returning
        id,
        user_id,
        chain,
        wallet_address,
        signature,
        signed_message,
        verified_at,
        created_at,
        updated_at
    `,
    [input.userId, input.walletAddress, input.signature, input.signedMessage, input.verifiedAt],
  );

  if (!row) {
    throw new Error("failed to link wallet");
  }

  return mapLinkedWallet(row);
};
