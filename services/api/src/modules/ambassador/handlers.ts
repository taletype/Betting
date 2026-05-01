import { createDatabaseClient } from "@bet/db";

import { insertAdminAuditRecord, insertAuditRecord } from "../shared/audit";
import {
  approveRewardPayout,
  createAmbassadorCodeForUser,
  createReferralAttribution,
  disableAmbassadorCode,
  findOpenRewardPayoutForRecipient,
  getAmbassadorRewardsConfig,
  listAdminAmbassadorOverview,
  markRewardPayoutPaid,
  markRewardsPayable,
  normalizePayoutWalletAddress,
  overrideReferralAttribution,
  recordBuilderRouteEvent,
  readAmbassadorDashboard,
  recordReferralClick,
  recordBuilderTradeAttribution,
  requestRewardPayout,
  updateRewardPayoutFailureState,
  voidRewardsForTradeAttribution,
  type AmbassadorDashboard,
} from "./repository";

const getSiteUrl = (): string => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

const buildInviteUrl = (code: string): string => `${getSiteUrl()}/?ref=${encodeURIComponent(code)}`;

const requireAdminUser = (adminUserId: string | undefined): string => {
  if (!adminUserId) {
    throw new Error("admin authorization is required");
  }

  return adminUserId;
};

export const getAmbassadorDashboard = async (userId?: string): Promise<AmbassadorDashboard> => {
  if (!userId) {
    throw new Error("authentication required");
  }

  const db = createDatabaseClient();
  const resolvedUserId = userId;

  return db.transaction((transaction) => readAmbassadorDashboard(transaction, resolvedUserId, buildInviteUrl));
};

export const captureAmbassadorReferral = async (input: {
  userId?: string;
  code: string;
  idempotencyKey?: string | null;
  sessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<AmbassadorDashboard> => {
  if (!input.userId) {
    throw new Error("authentication required");
  }

  const db = createDatabaseClient();
  const referredUserId = input.userId;

  await db.transaction(async (transaction) => {
    const attribution = await createReferralAttribution(transaction, {
      referredUserId,
      code: input.code,
      context: {
        idempotencyKey: input.idempotencyKey,
        sessionId: input.sessionId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });

    await insertAuditRecord(transaction, {
      actorUserId: referredUserId,
      action: "ambassador.referral_captured",
      entityType: "referral_attribution",
      entityId: attribution.id,
      metadata: {
        referrerUserId: attribution.referrerUserId,
        ambassadorCode: attribution.ambassadorCode,
      },
    });
  });

  return getAmbassadorDashboard(referredUserId);
};

export const captureReferralClick = async (input: {
  rawCode: string;
  landingPath?: string | null;
  queryRef?: string | null;
  anonymousSessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) => {
  const db = createDatabaseClient();
  return db.transaction((transaction) => recordReferralClick(transaction, input));
};

export const ingestBuilderRouteEvent = async (input: {
  eventId?: string | null;
  idempotencyKey?: string | null;
  eventType: string;
  appUserId?: string | null;
  walletAddress?: string | null;
  marketExternalId?: string | null;
  externalOrderId?: string | null;
  externalTradeId?: string | null;
  source?: string | null;
  builderCode?: string | null;
  side?: "maker" | "taker" | "unknown" | null;
  notionalAmountAtoms?: bigint | null;
  builderFeeBps?: number | null;
  builderFeeAmountAtoms?: bigint | null;
  asset?: string | null;
  rawReferenceId?: string | null;
  occurredAt?: string | null;
  rawJson?: Record<string, unknown>;
}) => {
  const db = createDatabaseClient();
  return db.transaction((transaction) => recordBuilderRouteEvent(transaction, input));
};

export const getAdminAmbassadorOverview = async () => {
  const db = createDatabaseClient();
  return listAdminAmbassadorOverview(db);
};

export const createAdminAmbassadorCode = async (input: {
  adminUserId?: string;
  ownerUserId: string;
  code?: string | null;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const code = await createAmbassadorCodeForUser(transaction, {
      ownerUserId: input.ownerUserId,
      code: input.code,
    });

    await insertAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.code_created",
      entityType: "ambassador_code",
      entityId: code.id,
      metadata: {
        ownerUserId: input.ownerUserId,
        code: code.code,
      },
    });
    await insertAdminAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.code_created",
      entityType: "ambassador_code",
      entityId: code.id,
      metadata: {
        ownerUserId: input.ownerUserId,
        code: code.code,
      },
    });

    return code;
  });
};

export const disableAdminAmbassadorCode = async (input: {
  adminUserId?: string;
  codeId: string;
  reason: string;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const code = await disableAmbassadorCode(transaction, input.codeId);

    await insertAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.code_disabled",
      entityType: "ambassador_code",
      entityId: code.id,
      metadata: {
        reason: input.reason,
      },
    });
    await insertAdminAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.code_disabled",
      entityType: "ambassador_code",
      entityId: code.id,
      metadata: {
        reason: input.reason,
      },
    });

    return code;
  });
};

export const overrideAdminReferralAttribution = async (input: {
  adminUserId?: string;
  referredUserId: string;
  ambassadorCode: string;
  reason: string;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();

  await db.transaction(async (transaction) => {
    const attribution = await overrideReferralAttribution(transaction, {
      referredUserId: input.referredUserId,
      code: input.ambassadorCode,
    });

    await insertAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.referral_override",
      entityType: "referral_attribution",
      entityId: attribution.id,
      metadata: {
        referredUserId: input.referredUserId,
        ambassadorCode: input.ambassadorCode,
        reason: input.reason,
      },
    });
    await insertAdminAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.referral_override",
      entityType: "referral_attribution",
      entityId: attribution.id,
      metadata: {
        referredUserId: input.referredUserId,
        ambassadorCode: input.ambassadorCode,
        reason: input.reason,
      },
    });
  });
};

export const recordAdminMockBuilderTradeAttribution = async (input: {
  adminUserId?: string;
  userId: string;
  polymarketOrderId?: string | null;
  polymarketTradeId?: string | null;
  marketSlug?: string | null;
  conditionId?: string | null;
  notionalUsdcAtoms: bigint;
  builderFeeUsdcAtoms: bigint;
  status: "pending" | "confirmed" | "void";
  rawJson?: Record<string, unknown>;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const safeStatus = input.status === "void" ? "void" : "pending";
    const tradeAttribution = await recordBuilderTradeAttribution(transaction, {
      userId: input.userId,
      polymarketOrderId: input.polymarketOrderId,
      polymarketTradeId: input.polymarketTradeId,
      marketSlug: input.marketSlug,
      conditionId: input.conditionId,
      notionalUsdcAtoms: input.notionalUsdcAtoms,
      builderFeeUsdcAtoms: input.builderFeeUsdcAtoms,
      status: safeStatus,
      rawJson: {
        source: "admin_placeholder_unconfirmed",
        requestedStatus: input.status,
        ...(input.rawJson ?? {}),
      },
    });

    await insertAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.unconfirmed_builder_trade_placeholder_recorded",
      entityType: "builder_trade_attribution",
      entityId: tradeAttribution.id,
      metadata: {
        userId: input.userId,
        requestedStatus: input.status,
        storedStatus: safeStatus,
        builderFeeUsdcAtoms: input.builderFeeUsdcAtoms.toString(),
      },
    });
    await insertAdminAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.unconfirmed_builder_trade_placeholder_recorded",
      entityType: "builder_trade_attribution",
      entityId: tradeAttribution.id,
      metadata: {
        userId: input.userId,
        requestedStatus: input.status,
        storedStatus: safeStatus,
        builderFeeUsdcAtoms: input.builderFeeUsdcAtoms.toString(),
      },
    });

    return {
      tradeAttribution,
      ledger: [],
    };
  });
};

export const voidAdminBuilderTradeAttribution = async (input: {
  adminUserId?: string;
  tradeAttributionId: string;
  reason: string;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();

  await db.transaction(async (transaction) => {
    await voidRewardsForTradeAttribution(transaction, input.tradeAttributionId, input.reason);
    await insertAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.builder_trade_voided",
      entityType: "builder_trade_attribution",
      entityId: input.tradeAttributionId,
      metadata: {
        reason: input.reason,
      },
    });
    await insertAdminAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.builder_trade_voided",
      entityType: "builder_trade_attribution",
      entityId: input.tradeAttributionId,
      metadata: {
        reason: input.reason,
      },
    });
  });
};

export const markAdminBuilderTradeRewardsPayable = async (input: {
  adminUserId?: string;
  tradeAttributionId: string;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const ledger = await markRewardsPayable(transaction, input.tradeAttributionId);
    await insertAdminAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "reward_ledger.mark_payable",
      entityType: "builder_trade_attribution",
      entityId: input.tradeAttributionId,
      metadata: { rewardLedgerCount: ledger.length },
    });
    return ledger;
  });
};

export const requestAmbassadorRewardPayout = async (input: {
  userId?: string;
  destinationType: "wallet" | "manual";
  destinationValue: string;
}) => {
  if (!input.userId) {
    throw new Error("authentication required");
  }

  const userId = input.userId;
  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const payableRows = await transaction.query<{ id: string; amount_usdc_atoms: bigint }>(
      `
        select id, amount_usdc_atoms
          from public.ambassador_reward_ledger
         where recipient_user_id = $1::uuid
           and status = 'payable'
         for update
      `,
      [userId],
    );
    const lockedPayableRewards = payableRows.reduce((sum, row) => sum + row.amount_usdc_atoms, 0n);
    const normalizedDestinationValue = input.destinationType === "wallet"
      ? normalizePayoutWalletAddress(input.destinationValue)
      : input.destinationValue;

    const payout = await requestRewardPayout(transaction, {
      recipientUserId: userId,
      destinationType: input.destinationType,
      destinationValue: normalizedDestinationValue,
      config: getAmbassadorRewardsConfig(),
    });
    const [reserved] = await transaction.query<{ amount: bigint }>(
      `
        select coalesce(sum(amount_usdc_atoms), 0::bigint) as amount
          from public.ambassador_reward_ledger
         where recipient_user_id = $1::uuid
           and status = 'approved'
           and reserved_by_payout_id = $2::uuid
      `,
      [userId, payout.id],
    );
    if ((reserved?.amount ?? 0n) !== lockedPayableRewards) {
      throw new Error("payout request must reserve the exact payable reward amount");
    }

    const persisted = await findOpenRewardPayoutForRecipient(transaction, userId);
    if (!persisted || persisted.id !== payout.id) {
      throw new Error("failed to read requested reward payout");
    }

    return persisted;
  });
};

export const approveAdminRewardPayout = async (input: {
  adminUserId?: string;
  payoutId: string;
  notes?: string | null;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const payout = await approveRewardPayout(transaction, {
      payoutId: input.payoutId,
      reviewedBy: adminUserId,
      notes: input.notes,
    });
    await insertAdminAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "payout.approve",
      entityType: "payout_request",
      entityId: input.payoutId,
      metadata: { beforeStatus: "requested", afterStatus: "approved", notes: input.notes ?? null },
    });
    return payout;
  });
};

export const markAdminRewardPayoutPaid = async (input: {
  adminUserId?: string;
  payoutId: string;
  txHash?: string | null;
  notes?: string | null;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const payout = await markRewardPayoutPaid(transaction, {
      payoutId: input.payoutId,
      reviewedBy: adminUserId,
      txHash: input.txHash,
      notes: input.notes,
    });
    await insertAdminAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "payout.mark_paid",
      entityType: "payout_request",
      entityId: input.payoutId,
      metadata: { beforeStatus: "approved", afterStatus: "paid", txHash: payout.txHash },
    });
    return payout;
  });
};

export const updateAdminRewardPayoutFailureState = async (input: {
  adminUserId?: string;
  payoutId: string;
  status: "failed" | "cancelled";
  notes: string;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const payout = await updateRewardPayoutFailureState(transaction, {
      payoutId: input.payoutId,
      reviewedBy: adminUserId,
      status: input.status,
      notes: input.notes,
    });
    await insertAdminAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: input.status === "failed" ? "payout.mark_failed" : "payout.cancel",
      entityType: "payout_request",
      entityId: input.payoutId,
      metadata: { afterStatus: input.status, notes: input.notes },
    });
    return payout;
  });
};
