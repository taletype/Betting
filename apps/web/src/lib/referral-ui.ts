export const pendingReferralPrimaryCopy = (code: string): string => `你正在使用推薦碼：${code}`;

export const pendingReferralSecondaryCopy = "登入後會自動嘗試套用此推薦碼。";

export const referralAppliedCopy = "推薦來源已保存";

export const referralRejectedCopy = "推薦碼未能使用";

export const mapReferralRejectionReason = (reason: string | null | undefined): string | null => {
  if (!reason) return null;

  const normalized = reason.toLowerCase();
  if (
    normalized.includes("self_referral") ||
    normalized.includes("self-referral") ||
    normalized.includes("self-referrals")
  ) {
    return "不能使用自己的推薦碼";
  }
  if (normalized.includes("disabled")) {
    return "推薦碼已停用";
  }
  if (
    normalized.includes("existing") ||
    normalized.includes("multiple_ref") ||
    normalized.includes("duplicate_referral") ||
    normalized.includes("已有推薦來源")
  ) {
    return "已有推薦來源";
  }
  if (
    normalized.includes("invalid") ||
    normalized.includes("malformed") ||
    normalized.includes("不可用") ||
    normalized.includes("無效")
  ) {
    return "推薦碼無效";
  }

  return null;
};
