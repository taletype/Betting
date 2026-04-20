import crypto from "node:crypto";

import { createDatabaseClient } from "@bet/db";
import { isAddress } from "ethers";

import { insertAuditRecord } from "../shared/audit";
import {
  getAvailableBalance,
  getWithdrawalForUpdate,
  insertWithdrawalCompletedJournal,
  insertWithdrawalFailedJournal,
  insertWithdrawalRequest,
  insertWithdrawalRequestedJournal,
  listRequestedWithdrawals,
  listWithdrawalsForUser,
  markWithdrawalCompleted,
  markWithdrawalFailed,
  type WithdrawalRecord,
} from "./repository";

const DEFAULT_WITHDRAWAL_CURRENCY = "USDC";

export interface RequestWithdrawalInput {
  userId?: string;
  amountAtoms: bigint;
  destinationAddress: string;
}

export interface ExecuteWithdrawalInput {
  adminUserId?: string;
  isAdmin: boolean;
  withdrawalId: string;
  txHash: string;
}

export interface FailWithdrawalInput {
  adminUserId?: string;
  isAdmin: boolean;
  withdrawalId: string;
  reason: string;
}

export interface WithdrawalView {
  id: string;
  amountAtoms: bigint;
  destinationAddress: string;
  status: WithdrawalRecord["status"];
  requestedAt: string;
  processedAt: string | null;
  txHash: string | null;
}

const normalizeAddress = (value: string): string => value.trim().toLowerCase();
const normalizeTxHash = (value: string): string => value.trim().toLowerCase();

const requireUser = (userId?: string): string => {
  if (!userId) {
    throw new Error("authentication required");
  }
  return userId;
};


export const assertValidWithdrawalRequest = (input: {
  amountAtoms: bigint;
  destinationAddress: string;
}): { destinationAddress: string } => {
  const destinationAddress = normalizeAddress(input.destinationAddress);

  if (input.amountAtoms <= 0n) {
    throw new Error("amountAtoms must be greater than zero");
  }

  if (!isAddress(destinationAddress)) {
    throw new Error("destinationAddress must be a valid Base/EVM address");
  }

  return { destinationAddress };
};

const mapWithdrawalView = (record: WithdrawalRecord): WithdrawalView => ({
  id: record.id,
  amountAtoms: record.amount,
  destinationAddress: record.destinationAddress,
  status: record.status,
  requestedAt: record.createdAt,
  processedAt: record.processedAt,
  txHash: record.txHash,
});

export const requestWithdrawal = async (input: RequestWithdrawalInput): Promise<WithdrawalView> => {
  const userId = requireUser(input.userId);
  const { destinationAddress } = assertValidWithdrawalRequest({
    amountAtoms: input.amountAtoms,
    destinationAddress: input.destinationAddress,
  });

  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const available = await getAvailableBalance(transaction, {
      userId,
      currency: DEFAULT_WITHDRAWAL_CURRENCY,
    });

    if (available < input.amountAtoms) {
      throw new Error("insufficient available balance");
    }

    const requestedJournalId = crypto.randomUUID();

    const withdrawal = await insertWithdrawalRequest(transaction, {
      userId,
      amount: input.amountAtoms,
      currency: DEFAULT_WITHDRAWAL_CURRENCY,
      destinationAddress,
      requestedJournalId,
    });

    await insertWithdrawalRequestedJournal(transaction, {
      journalId: requestedJournalId,
      withdrawalId: withdrawal.id,
      userId,
      currency: DEFAULT_WITHDRAWAL_CURRENCY,
      amount: input.amountAtoms,
      destinationAddress,
    });

    await insertAuditRecord(transaction, {
      actorUserId: userId,
      action: "withdrawal.requested",
      entityType: "withdrawal",
      entityId: withdrawal.id,
      metadata: {
        amountAtoms: input.amountAtoms.toString(),
        destinationAddress,
      },
    });

    return mapWithdrawalView(withdrawal);
  });
};

export const getWithdrawalHistory = async (userId?: string): Promise<WithdrawalView[]> => {
  const id = requireUser(userId);
  const db = createDatabaseClient();
  const rows = await listWithdrawalsForUser(db, id);
  return rows.map((row) => mapWithdrawalView(row));
};

export const getRequestedWithdrawals = async (input: {
  isAdmin: boolean;
}): Promise<WithdrawalView[]> => {
  if (!input.isAdmin) {
    throw new Error("admin authorization is required");
  }

  const db = createDatabaseClient();
  const rows = await listRequestedWithdrawals(db);
  return rows.map((row) => mapWithdrawalView(row));
};


export const assertRequestedStatus = (status: WithdrawalRecord["status"]): void => {
  if (status !== "requested") {
    throw new Error("withdrawal is not in requested state");
  }
};

export const executeWithdrawal = async (input: ExecuteWithdrawalInput): Promise<WithdrawalView> => {
  if (!input.isAdmin) {
    throw new Error("admin authorization is required");
  }

  const adminUserId = requireUser(input.adminUserId);
  const txHash = normalizeTxHash(input.txHash);

  if (!txHash) {
    throw new Error("txHash is required");
  }

  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const existing = await getWithdrawalForUpdate(transaction, input.withdrawalId);

    if (!existing) {
      throw new Error("withdrawal not found");
    }

    assertRequestedStatus(existing.status);

    const completedJournalId = crypto.randomUUID();

    await insertWithdrawalCompletedJournal(transaction, {
      journalId: completedJournalId,
      withdrawalId: existing.id,
      userId: existing.userId,
      amount: existing.amount,
      currency: existing.currency,
      txHash,
    });

    const withdrawal = await markWithdrawalCompleted(transaction, {
      withdrawalId: existing.id,
      adminUserId,
      txHash,
      completedJournalId,
    });

    await insertAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "withdrawal.completed",
      entityType: "withdrawal",
      entityId: existing.id,
      metadata: {
        txHash,
      },
    });

    return mapWithdrawalView(withdrawal);
  });
};

export const failWithdrawal = async (input: FailWithdrawalInput): Promise<WithdrawalView> => {
  if (!input.isAdmin) {
    throw new Error("admin authorization is required");
  }

  const adminUserId = requireUser(input.adminUserId);
  const reason = input.reason.trim();

  if (!reason) {
    throw new Error("failure reason is required");
  }

  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const existing = await getWithdrawalForUpdate(transaction, input.withdrawalId);

    if (!existing) {
      throw new Error("withdrawal not found");
    }

    assertRequestedStatus(existing.status);

    const failedJournalId = crypto.randomUUID();

    await insertWithdrawalFailedJournal(transaction, {
      journalId: failedJournalId,
      withdrawalId: existing.id,
      userId: existing.userId,
      amount: existing.amount,
      currency: existing.currency,
      reason,
    });

    const withdrawal = await markWithdrawalFailed(transaction, {
      withdrawalId: existing.id,
      adminUserId,
      reason,
      failedJournalId,
    });

    await insertAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "withdrawal.failed",
      entityType: "withdrawal",
      entityId: existing.id,
      metadata: {
        reason,
      },
    });

    return mapWithdrawalView(withdrawal);
  });
};
