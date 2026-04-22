import { createDatabaseClient } from "@bet/db";

import { insertAuditRecord } from "../shared/audit";
import { DEMO_USER_ID } from "../shared/constants";
import {
  activateCommissionPlan,
  assignSponsor,
  countTotalDownline,
  createCommissionPlan,
  ensureReferralCode,
  getActiveCommissionPlan,
  getCommissionMetrics,
  getReferralCodeByCode,
  getSponsorRelationship,
  listCommissionEventsForUser,
  listCommissionPlans,
  listDirectReferrals,
  listRecentCommissionEvents,
  listReferralRelationships,
  type CommissionPlanRecord,
} from "./repository";

const getSiteUrl = (): string => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

const buildInviteUrl = (code: string): string => `${getSiteUrl()}/referrals?code=${encodeURIComponent(code)}`;

export const getMlmDashboard = async (userId?: string) => {
  const resolvedUserId = userId ?? DEMO_USER_ID;
  const db = createDatabaseClient();

  return db.transaction(async (transaction) => {
    const referralCode = await ensureReferralCode(transaction, resolvedUserId);
    const [sponsor, directReferrals, totalDownlineCount, metrics, commissions] = await Promise.all([
      getSponsorRelationship(transaction, resolvedUserId),
      listDirectReferrals(transaction, resolvedUserId),
      countTotalDownline(transaction, resolvedUserId),
      getCommissionMetrics(transaction, resolvedUserId),
      listCommissionEventsForUser(transaction, resolvedUserId),
    ]);

    return {
      referralCode: {
        ...referralCode,
        inviteUrl: buildInviteUrl(referralCode.code),
      },
      sponsor,
      directReferrals,
      metrics: {
        directReferralCount: directReferrals.length,
        totalDownlineCount,
        lifetimeCommission: metrics.lifetimeCommission,
        recentCommission30d: metrics.recentCommission30d,
      },
      commissions,
    };
  });
};

export const joinReferralProgram = async (input: { userId?: string; code: string }) => {
  const referredUserId = input.userId ?? DEMO_USER_ID;
  const db = createDatabaseClient();

  await db.transaction(async (transaction) => {
    const referralCode = await getReferralCodeByCode(transaction, input.code);
    if (!referralCode) {
      throw new Error("invalid referral code");
    }

    await assignSponsor(transaction, {
      referredUserId,
      sponsorUserId: referralCode.userId,
      referralCodeId: referralCode.id,
      source: "invite_code",
      actorUserId: referredUserId,
      notes: null,
    });

    await insertAuditRecord(transaction, {
      actorUserId: referredUserId,
      action: "mlm.joined",
      entityType: "referral_relationship",
      entityId: referredUserId,
      metadata: {
        sponsorUserId: referralCode.userId,
        referralCode: referralCode.code,
      },
    });
  });

  return getMlmDashboard(referredUserId);
};

export const getAdminMlmOverview = async (): Promise<{
  activePlan: CommissionPlanRecord | null;
  plans: CommissionPlanRecord[];
  recentCommissions: Awaited<ReturnType<typeof listRecentCommissionEvents>>;
  relationships: Awaited<ReturnType<typeof listReferralRelationships>>;
}> => {
  const db = createDatabaseClient();
  const [plans, recentCommissions, relationships] = await Promise.all([
    listCommissionPlans(db),
    listRecentCommissionEvents(db),
    listReferralRelationships(db),
  ]);

  return {
    activePlan: plans.find((plan) => plan.isActive) ?? null,
    plans,
    recentCommissions,
    relationships,
  };
};

export const createAdminCommissionPlan = async (input: {
  adminUserId: string;
  name: string;
  levels: { levelDepth: number; rateBps: number }[];
  activate: boolean;
}) => {
  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const plan = await createCommissionPlan(transaction, {
      name: input.name,
      createdByUserId: input.adminUserId,
      levels: input.levels,
      activate: input.activate,
    });

    await insertAuditRecord(transaction, {
      actorUserId: input.adminUserId,
      action: "mlm.plan.created",
      entityType: "mlm_commission_plan",
      entityId: plan.id,
      metadata: {
        name: plan.name,
        version: plan.version,
        activate: input.activate,
      },
    });

    return plan;
  });
};

export const activateAdminCommissionPlan = async (input: { adminUserId: string; planId: string }) => {
  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const existingPlan = await getActiveCommissionPlan(transaction);
    await activateCommissionPlan(transaction, input.planId);

    await insertAuditRecord(transaction, {
      actorUserId: input.adminUserId,
      action: "mlm.plan.activated",
      entityType: "mlm_commission_plan",
      entityId: input.planId,
      metadata: {
        previousPlanId: existingPlan?.id ?? null,
      },
    });
  });
};

export const overrideReferralSponsor = async (input: {
  adminUserId: string;
  referredUserId: string;
  sponsorCode: string;
  reason: string;
}) => {
  const db = createDatabaseClient();
  return db.transaction(async (transaction) => {
    const referralCode = await getReferralCodeByCode(transaction, input.sponsorCode);
    if (!referralCode) {
      throw new Error("invalid referral code");
    }

    await assignSponsor(transaction, {
      referredUserId: input.referredUserId,
      sponsorUserId: referralCode.userId,
      referralCodeId: referralCode.id,
      source: "admin_override",
      actorUserId: input.adminUserId,
      notes: input.reason.trim() || null,
    });

    await insertAuditRecord(transaction, {
      actorUserId: input.adminUserId,
      action: "mlm.relationship.overridden",
      entityType: "referral_relationship",
      entityId: input.referredUserId,
      metadata: {
        sponsorUserId: referralCode.userId,
        sponsorCode: referralCode.code,
        reason: input.reason,
      },
    });
  });
};
