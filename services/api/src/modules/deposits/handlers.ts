import crypto from "node:crypto";

import { createBaseChainAdapter, type DepositVerificationAdapter } from "@bet/chain";
import { readEthereumAddress, readPositiveInteger } from "@bet/config";
import { createDatabaseClient } from "@bet/db";
import { incrementCounter, logger } from "@bet/observability";

import { getLinkedWalletForUser } from "../wallets/repository";
import { insertAuditRecord } from "../shared/audit";
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

const normalizeTxHash = (txHash: string): string => txHash.trim().toLowerCase();

const baseUsdcAddress = (): string => readEthereumAddress("BASE_USDC_ADDRESS");

const baseTreasuryAddress = (): string => readEthereumAddress("BASE_TREASURY_ADDRESS");

const minConfirmations = (): number =>
  readPositiveInteger("BASE_MIN_CONFIRMATIONS", {
    defaultInLocal: 3,
  });

export const getDepositHistory = async (userId?: string) => {
  if (!userId) {
    throw new Error("authentication required");
  }

  const db = createDatabaseClient();
  return listDepositsForUser(db, userId);
};

export const verifyDepositWithDependencies = async (
  input: VerifyDepositInput,
  dependencies?: { adapter?: DepositVerificationAdapter },
): Promise<VerifyDepositResult> => {
  if (!input.userId) {
    throw new Error("authentication required");
  }

  const userId = input.userId;
  const db = createDatabaseClient();
  const adapter = dependencies?.adapter ?? createBaseChainAdapter();
  const txHash = normalizeTxHash(input.txHash);

  try {
    const result: VerifyDepositResult = await db.transaction(async (transaction) => {
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

    incrementCounter("deposit_verification_success_total", {
      status: result.status,
    });
    logger.info("deposit verification succeeded", {
      userId,
      txHash,
      status: result.status,
      depositId: result.deposit.id,
      amount: result.deposit.amount.toString(),
    });

    return result;
  } catch (error) {
    incrementCounter("deposit_verification_failure_total", {
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    logger.error("deposit verification failed", {
      userId,
      txHash,
      error: error instanceof Error ? error.message : "unknown error",
    });
    throw error;
  }
};


export const verifyDeposit = async (input: VerifyDepositInput): Promise<VerifyDepositResult> =>
  verifyDepositWithDependencies(input);
