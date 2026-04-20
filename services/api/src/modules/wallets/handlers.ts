import { createDatabaseClient } from "@bet/db";
import { verifyMessage } from "ethers";

import { insertAuditRecord } from "../shared/audit";
import { DEMO_USER_ID } from "../shared/constants";
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
  const db = createDatabaseClient();
  return getLinkedWalletForUser(db, userId ?? DEMO_USER_ID);
};

export const linkBaseWallet = async (input: LinkWalletInput) => {
  const userId = input.userId ?? DEMO_USER_ID;
  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    assertWalletLinkMessage(input.signedMessage, userId);

    const recoveredAddress = verifyMessage(input.signedMessage, input.signature);

    if (normalizeAddress(recoveredAddress) !== normalizeAddress(input.walletAddress)) {
      throw new Error("signature does not match wallet address");
    }

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
