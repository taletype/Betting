import type { DatabaseExecutor, DatabaseTransaction } from "@bet/db";

import type { WalletLinkChallengeRecord, WalletLinkChallengeStore } from "./challenge";

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

export const createDatabaseWalletLinkChallengeStore = (
  executor: DatabaseExecutor | DatabaseTransaction,
): WalletLinkChallengeStore => ({
  async insertChallenge(record) {
    const [row] = await executor.query<{ id: string }>(
      `
        insert into public.wallet_link_challenges (
          user_id, wallet_address, chain, nonce_hash, domain, issued_at, expires_at, consumed_at, created_at
        ) values ($1::uuid, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, null, now())
        returning id
      `,
      [
        record.userId,
        record.walletAddress,
        record.chain,
        record.nonceHash,
        record.domain,
        record.issuedAt,
        record.expiresAt,
      ],
    );
    if (!row) throw new Error("failed to create wallet link challenge");
    return row;
  },
  async consumeChallenge(input) {
    const [row] = await executor.query<{
      user_id: string;
      wallet_address: string;
      chain: "base";
      domain: string;
      nonce_hash: string;
      issued_at: Date | string;
      expires_at: Date | string;
      consumed_at: Date | string | null;
    }>(
      `
        update public.wallet_link_challenges
           set consumed_at = $6::timestamptz
         where ($7::uuid is null or id = $7::uuid)
           and user_id = $1::uuid
           and wallet_address = $2
           and chain = $3
           and domain = $4
           and nonce_hash = $5
           and consumed_at is null
           and expires_at > $6::timestamptz
        returning user_id, wallet_address, chain, domain, nonce_hash, issued_at, expires_at, consumed_at
      `,
      [input.userId, input.walletAddress, input.chain, input.domain, input.nonceHash, input.now, input.challengeId ?? null],
    );

    if (!row) return null;
    return {
      userId: row.user_id,
      walletAddress: row.wallet_address,
      chain: row.chain,
      domain: row.domain,
      nonceHash: row.nonce_hash,
      issuedAt: toIso(row.issued_at),
      expiresAt: toIso(row.expires_at),
      consumedAt: row.consumed_at ? toIso(row.consumed_at) : null,
    } satisfies WalletLinkChallengeRecord;
  },
});
