"use server";

import { revalidatePath } from "next/cache";

import {
  approveAdminRewardPayout,
  cancelAdminRewardPayout,
  createAdminAmbassadorCode,
  disableAdminAmbassadorCode,
  failAdminRewardPayout,
  markAdminRewardPayoutPaid,
  markAdminRewardsPayable,
  overrideAdminReferralAttribution,
  recordAdminMockBuilderTradeAttribution,
  voidAdminTradeAttributionRewards,
} from "../../lib/api";

export const createAmbassadorCodeAction = async (formData: FormData) => {
  await createAdminAmbassadorCode({
    ownerUserId: String(formData.get("ownerUserId") ?? ""),
    code: String(formData.get("code") ?? "").trim() || null,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/ambassadors");
};

export const disableAmbassadorCodeAction = async (formData: FormData) => {
  await disableAdminAmbassadorCode(String(formData.get("codeId") ?? ""), String(formData.get("reason") ?? ""));
  revalidatePath("/admin");
  revalidatePath("/admin/ambassadors");
};

export const overrideReferralAttributionAction = async (formData: FormData) => {
  await overrideAdminReferralAttribution({
    referredUserId: String(formData.get("referredUserId") ?? ""),
    ambassadorCode: String(formData.get("ambassadorCode") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/ambassadors");
  revalidatePath("/ambassador");
};

export const recordMockBuilderTradeAction = async (formData: FormData) => {
  await recordAdminMockBuilderTradeAttribution({
    userId: String(formData.get("userId") ?? ""),
    notionalUsdcAtoms: String(formData.get("notionalUsdcAtoms") ?? "0"),
    builderFeeUsdcAtoms: String(formData.get("builderFeeUsdcAtoms") ?? "0"),
    status: "confirmed",
    conditionId: String(formData.get("conditionId") ?? "").trim() || null,
    marketSlug: String(formData.get("marketSlug") ?? "").trim() || null,
    polymarketOrderId: String(formData.get("polymarketOrderId") ?? "").trim() || null,
    polymarketTradeId: String(formData.get("polymarketTradeId") ?? "").trim() || null,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/rewards");
};

export const markRewardsPayableAction = async (formData: FormData) => {
  await markAdminRewardsPayable(String(formData.get("tradeAttributionId") ?? ""));
  revalidatePath("/admin/rewards");
};

export const voidTradeRewardsAction = async (formData: FormData) => {
  await voidAdminTradeAttributionRewards(
    String(formData.get("tradeAttributionId") ?? ""),
    String(formData.get("reason") ?? ""),
  );
  revalidatePath("/admin/rewards");
};

export const approveRewardPayoutAction = async (formData: FormData) => {
  await approveAdminRewardPayout(String(formData.get("payoutId") ?? ""), String(formData.get("notes") ?? ""));
  revalidatePath("/admin/payouts");
};

export const markRewardPayoutPaidAction = async (formData: FormData) => {
  await markAdminRewardPayoutPaid(String(formData.get("payoutId") ?? ""), {
    txHash: String(formData.get("txHash") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  revalidatePath("/admin/payouts");
};

export const failRewardPayoutAction = async (formData: FormData) => {
  await failAdminRewardPayout(String(formData.get("payoutId") ?? ""), String(formData.get("notes") ?? ""));
  revalidatePath("/admin/payouts");
};

export const cancelRewardPayoutAction = async (formData: FormData) => {
  await cancelAdminRewardPayout(String(formData.get("payoutId") ?? ""), String(formData.get("notes") ?? ""));
  revalidatePath("/admin/payouts");
};
