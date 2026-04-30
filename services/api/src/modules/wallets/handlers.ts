import { createDatabaseClient } from "@bet/db";
import { insertAuditRecord } from "../shared/audit";
import {
  createDatabaseWalletLinkChallengeStore,
  getLinkedWalletForUser,
  upsertLinkedWallet,
} from "./repository";
import {
  WALLET_LINK_CHAIN,
  createWalletLinkChallenge,
  normalizeDomain,
  normalizeWalletAddress,
  parseWalletLinkMessage,
  verifyAndConsumeWalletLinkChallenge,
} from "./challenge";

export interface LinkWalletInput {
  userId?: string;
  walletAddress: string;
  chain?: string;
  challengeId?: string;
  signature: string;
  signedMessage: string;
  domain: string;
}

export const getWalletLinkDomain = (requestHost?: string | null): string =>
  normalizeDomain(process.env.NEXT_PUBLIC_SITE_DOMAIN ?? process.env.SITE_DOMAIN ?? requestHost ?? "localhost");

export const getLinkedWallet = async (userId?: string) => {
  if (!userId) {
    throw new Error("authentication required");
  }

  const db = createDatabaseClient();
  return getLinkedWalletForUser(db, userId);
};

export const linkBaseWallet = async (input: LinkWalletInput) => {
  if (!input.userId) {
    throw new Error("authentication required");
  }

  const userId = input.userId;
  parseWalletLinkMessage(input.signedMessage);

  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    await verifyAndConsumeWalletLinkChallenge({
      userId,
      walletAddress: input.walletAddress,
      chain: input.chain ?? WALLET_LINK_CHAIN,
      domain: input.domain,
      challengeId: input.challengeId,
      signedMessage: input.signedMessage,
      signature: input.signature,
      store: createDatabaseWalletLinkChallengeStore(transaction),
    });

    const linkedWallet = await upsertLinkedWallet(transaction, {
      userId,
      walletAddress: normalizeWalletAddress(input.walletAddress),
      signature: input.signature,
      signedMessage: input.signedMessage,
      verifiedAt: new Date().toISOString(),
    });

    await insertAuditRecord(transaction, {
      actorUserId: userId,
      action: "wallet.linked",
      entityType: "linked_wallet",
      entityId: linkedWallet.id,
      metadata: {
        chain: linkedWallet.chain,
        walletAddress: linkedWallet.walletAddress,
      },
    });

    return linkedWallet;
  });
};

export const createLinkWalletChallenge = async (input: {
  userId?: string;
  walletAddress: string;
  chain?: string;
  domain: string;
}) => {
  if (!input.userId) {
    throw new Error("authentication required");
  }

  const db = createDatabaseClient();
  return createWalletLinkChallenge({
    userId: input.userId,
    walletAddress: input.walletAddress,
    chain: input.chain ?? WALLET_LINK_CHAIN,
    domain: input.domain,
    store: createDatabaseWalletLinkChallengeStore(db),
  });
};
