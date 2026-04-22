"use server";

import { revalidatePath } from "next/cache";

import {
  activateAdminMlmPlan,
  apiRequest,
  createAdminMlmPlan,
  executeAdminWithdrawal,
  failAdminWithdrawal,
  overrideAdminReferralSponsor,
} from "../../lib/api";

export const resolveMarketAction = async (formData: FormData) => {
  const marketId = String(formData.get("marketId") ?? "");
  const winningOutcomeId = String(formData.get("winningOutcomeId") ?? "");
  const evidenceText = String(formData.get("evidenceText") ?? "");
  const evidenceUrlRaw = String(formData.get("evidenceUrl") ?? "").trim();
  const resolverId = String(formData.get("resolverId") ?? "");

  await apiRequest(`/admin/markets/${marketId}/resolve`, {
    method: "POST",
    body: JSON.stringify({
      winningOutcomeId,
      evidenceText,
      evidenceUrl: evidenceUrlRaw ? evidenceUrlRaw : null,
      resolverId,
    }),
  });

  revalidatePath("/admin");
  revalidatePath(`/markets/${marketId}`);
  revalidatePath("/portfolio");
};

export const executeWithdrawalAction = async (formData: FormData) => {
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const txHash = String(formData.get("txHash") ?? "");

  await executeAdminWithdrawal(withdrawalId, txHash);

  revalidatePath("/admin");
  revalidatePath("/portfolio");
};

export const failWithdrawalAction = async (formData: FormData) => {
  const withdrawalId = String(formData.get("withdrawalId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  await failAdminWithdrawal(withdrawalId, reason);

  revalidatePath("/admin");
  revalidatePath("/portfolio");
};

export const createMlmPlanAction = async (formData: FormData) => {
  const name = String(formData.get("name") ?? "");
  const levelOneRateBps = Number(String(formData.get("levelOneRateBps") ?? "0"));
  const levelTwoRateBps = Number(String(formData.get("levelTwoRateBps") ?? "0"));
  const levelThreeRateBps = Number(String(formData.get("levelThreeRateBps") ?? "0"));
  const activate = String(formData.get("activate") ?? "") === "on";

  await createAdminMlmPlan({
    name,
    activate,
    levels: [
      { levelDepth: 1, rateBps: levelOneRateBps },
      { levelDepth: 2, rateBps: levelTwoRateBps },
      { levelDepth: 3, rateBps: levelThreeRateBps },
    ],
  });

  revalidatePath("/admin");
  revalidatePath("/referrals");
};

export const activateMlmPlanAction = async (formData: FormData) => {
  const planId = String(formData.get("planId") ?? "");
  await activateAdminMlmPlan(planId);
  revalidatePath("/admin");
};

export const overrideReferralSponsorAction = async (formData: FormData) => {
  await overrideAdminReferralSponsor({
    referredUserId: String(formData.get("referredUserId") ?? ""),
    sponsorCode: String(formData.get("sponsorCode") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  revalidatePath("/admin");
  revalidatePath("/referrals");
};
