import { createDatabaseClient } from "@bet/db";
import { verifyMessage } from "ethers";

import { insertAuditRecord } from "../shared/audit";
import { getLinkedWalletForUser, upsertLinkedWallet } from "./repository";

export interface LinkWalletInput {
  userId?: string;
  walletAddress: string;
  signature: string;
  signedMessage: string;
}

const normalizeAddress = (address: string): string => address.trim().toLowerCase();

export const assertWalletLinkMessage = (message: string, userId: string): void => {
  if (!message.includes("Bet wallet link")) {
    throw new Error("invalid signed message prefix");
  }

  if (!message.includes(`user:${userId}`)) {
    throw new Error("signed message user mismatch");
  }
};

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
  assertWalletLinkMessage(input.signedMessage, userId);

  const recoveredAddress = verifyMessage(input.signedMessage, input.signature);

  if (normalizeAddress(recoveredAddress) !== normalizeAddress(input.walletAddress)) {
    throw new Error("signature does not match wallet address");
  }

  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const linkedWallet = await upsertLinkedWallet(transaction, {
      userId,
      walletAddress: normalizeAddress(input.walletAddress),
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
