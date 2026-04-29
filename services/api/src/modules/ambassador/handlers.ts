import { createDatabaseClient } from "@bet/db";

import { insertAuditRecord } from "../shared/audit";
import { DEMO_USER_ID } from "../shared/constants";
import {
  accountConfirmedBuilderTradeRewards,
  approveRewardPayout,
  createAmbassadorCodeForUser,
  createReferralAttribution,
  disableAmbassadorCode,
  getAmbassadorRewardsConfig,
  listAdminAmbassadorOverview,
  markRewardPayoutPaid,
  markRewardsPayable,
  overrideReferralAttribution,
  readAmbassadorDashboard,
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
  const db = createDatabaseClient();
  const resolvedUserId = userId ?? DEMO_USER_ID;

  return db.transaction((transaction) => readAmbassadorDashboard(transaction, resolvedUserId, buildInviteUrl));
};

export const captureAmbassadorReferral = async (input: {
  userId?: string;
  code: string;
}): Promise<AmbassadorDashboard> => {
  const db = createDatabaseClient();
  const referredUserId = input.userId ?? DEMO_USER_ID;

  await db.transaction(async (transaction) => {
    const attribution = await createReferralAttribution(transaction, {
      referredUserId,
      code: input.code,
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
    const tradeAttribution = await recordBuilderTradeAttribution(transaction, {
      userId: input.userId,
      polymarketOrderId: input.polymarketOrderId,
      polymarketTradeId: input.polymarketTradeId,
      marketSlug: input.marketSlug,
      conditionId: input.conditionId,
      notionalUsdcAtoms: input.notionalUsdcAtoms,
      builderFeeUsdcAtoms: input.builderFeeUsdcAtoms,
      status: input.status,
      rawJson: {
        source: "admin_mock",
        ...(input.rawJson ?? {}),
      },
    });

    let ledger = tradeAttribution.status === "confirmed"
      ? await accountConfirmedBuilderTradeRewards(transaction, {
          tradeAttributionId: tradeAttribution.id,
          config: getAmbassadorRewardsConfig(),
        })
      : [];

    if (ledger.length > 0) {
      ledger = await markRewardsPayable(transaction, tradeAttribution.id);
    }

    await insertAuditRecord(transaction, {
      actorUserId: adminUserId,
      action: "ambassador.mock_builder_trade_recorded",
      entityType: "builder_trade_attribution",
      entityId: tradeAttribution.id,
      metadata: {
        userId: input.userId,
        status: input.status,
        builderFeeUsdcAtoms: input.builderFeeUsdcAtoms.toString(),
      },
    });

    return {
      tradeAttribution,
      ledger,
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
  });
};

export const markAdminBuilderTradeRewardsPayable = async (input: {
  adminUserId?: string;
  tradeAttributionId: string;
}) => {
  requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();
  return db.transaction((transaction) => markRewardsPayable(transaction, input.tradeAttributionId));
};

export const requestAmbassadorRewardPayout = async (input: {
  userId?: string;
  destinationType: "wallet" | "manual";
  destinationValue: string;
}) => {
  const userId = input.userId ?? DEMO_USER_ID;
  const db = createDatabaseClient();
  return db.transaction((transaction) =>
    requestRewardPayout(transaction, {
      recipientUserId: userId,
      destinationType: input.destinationType,
      destinationValue: input.destinationValue,
      config: getAmbassadorRewardsConfig(),
    }),
  );
};

export const approveAdminRewardPayout = async (input: {
  adminUserId?: string;
  payoutId: string;
  notes?: string | null;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();
  return db.transaction((transaction) =>
    approveRewardPayout(transaction, {
      payoutId: input.payoutId,
      reviewedBy: adminUserId,
      notes: input.notes,
    }),
  );
};

export const markAdminRewardPayoutPaid = async (input: {
  adminUserId?: string;
  payoutId: string;
  txHash?: string | null;
  notes?: string | null;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();
  return db.transaction((transaction) =>
    markRewardPayoutPaid(transaction, {
      payoutId: input.payoutId,
      reviewedBy: adminUserId,
      txHash: input.txHash,
      notes: input.notes,
    }),
  );
};

export const updateAdminRewardPayoutFailureState = async (input: {
  adminUserId?: string;
  payoutId: string;
  status: "failed" | "cancelled";
  notes: string;
}) => {
  const adminUserId = requireAdminUser(input.adminUserId);
  const db = createDatabaseClient();
  return db.transaction((transaction) =>
    updateRewardPayoutFailureState(transaction, {
      payoutId: input.payoutId,
      reviewedBy: adminUserId,
      status: input.status,
      notes: input.notes,
    }),
  );
};
