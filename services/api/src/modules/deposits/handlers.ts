import crypto from "node:crypto";

import { createBaseChainAdapter } from "@bet/chain";
import { createDatabaseClient } from "@bet/db";

import { getLinkedWalletForUser } from "../wallets/repository";
import { insertAuditRecord } from "../shared/audit";
import { DEMO_USER_ID } from "../shared/constants";
import {
  getDepositByTxHash,
  insertDepositJournal,
  insertDepositRecord,
  insertDepositVerificationAttempt,
  listDepositsForUser,
  type DepositRecord,
} from "./repository";

export interface VerifyDepositInput {
  userId?: string;
  txHash: string;
}

export interface VerifyDepositResult {
  status: "accepted" | "already_credited";
  deposit: DepositRecord;
}

const normalizeAddress = (address: string): string => address.trim().toLowerCase();
const normalizeTxHash = (txHash: string): string => txHash.trim().toLowerCase();

const baseUsdcAddress = (): string =>
  normalizeAddress(process.env.BASE_USDC_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");

const baseTreasuryAddress = (): string => {
  const value = process.env.BASE_TREASURY_ADDRESS;
  if (!value) {
    throw new Error("BASE_TREASURY_ADDRESS is required");
  }
  return normalizeAddress(value);
};

const minConfirmations = (): number => Number(process.env.BASE_MIN_CONFIRMATIONS ?? "3");

export const getDepositHistory = async (userId?: string) => {
  const db = createDatabaseClient();
  return listDepositsForUser(db, userId ?? DEMO_USER_ID);
};

export const verifyDepositWithDependencies = async (
  input: VerifyDepositInput,
  dependencies?: { adapter?: ReturnType<typeof createBaseChainAdapter> },
): Promise<VerifyDepositResult> => {
  const userId = input.userId ?? DEMO_USER_ID;
  const db = createDatabaseClient();
  const adapter = dependencies?.adapter ?? createBaseChainAdapter();
  const txHash = normalizeTxHash(input.txHash);

  return db.transaction(async (transaction) => {
    const existing = await getDepositByTxHash(transaction, { chain: "base", txHash });
    if (existing) {
      if (existing.userId !== userId) {
        throw new Error("deposit tx already credited to another user");
      }

      await insertDepositVerificationAttempt(transaction, {
        userId,
        txHash,
        status: "accepted",
        reason: "already_credited",
      });

      return {
        status: "already_credited",
        deposit: existing,
      };
    }

    const linkedWallet = await getLinkedWalletForUser(transaction, userId);
    if (!linkedWallet) {
      throw new Error("link a Base wallet before verifying deposits");
    }

    const verification = await adapter.verifyUsdcTransfer({
      txHash,
      tokenAddress: baseUsdcAddress(),
      expectedFrom: linkedWallet.walletAddress,
      expectedTo: baseTreasuryAddress(),
      minConfirmations: minConfirmations(),
    });

    if (verification.status !== "confirmed" || !verification.transfer) {
      await insertDepositVerificationAttempt(transaction, {
        userId,
        txHash,
        status: "rejected",
        reason: verification.status,
        metadata: {
          reason: verification.reason ?? null,
          confirmations: verification.confirmations ?? null,
        },
      });

      throw new Error(`deposit verification failed: ${verification.status}`);
    }

    const journalId = crypto.randomUUID();

    await insertDepositJournal(transaction, {
      journalId,
      reference: `base:${verification.transfer.txHash}`,
      userId,
      currency: "USDC",
      amount: verification.transfer.amount,
      metadata: {
        chain: "base",
        txHash: verification.transfer.txHash,
        sender: verification.transfer.from,
        recipient: verification.transfer.to,
        tokenAddress: verification.transfer.tokenAddress,
      },
    });

    const deposit = await insertDepositRecord(transaction, {
      userId,
      txHash: verification.transfer.txHash,
      txSender: verification.transfer.from,
      txRecipient: verification.transfer.to,
      tokenAddress: verification.transfer.tokenAddress,
      amount: verification.transfer.amount,
      currency: "USDC",
      blockNumber: verification.transfer.blockNumber,
      journalId,
      metadata: {
        confirmations: verification.confirmations ?? null,
      },
    });

    await insertDepositVerificationAttempt(transaction, {
      userId,
      txHash,
      status: "accepted",
      reason: null,
      metadata: {
        creditedAmount: verification.transfer.amount.toString(),
      },
    });

    await insertAuditRecord(transaction, {
      actorUserId: userId,
      action: "deposit.verified",
      entityType: "chain_deposit",
      entityId: deposit.id,
      metadata: {
        txHash: deposit.txHash,
        amount: deposit.amount.toString(),
        chain: deposit.chain,
      },
    });

    return {
      status: "accepted",
      deposit,
    };
  });
};


export const verifyDeposit = async (input: VerifyDepositInput): Promise<VerifyDepositResult> =>
  verifyDepositWithDependencies(input);
