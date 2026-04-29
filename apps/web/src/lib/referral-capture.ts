export const pendingReferralStorageKey = "bet_pending_referral_code";
export const pendingReferralCookieName = "bet_pending_ref";

export const normalizeReferralCode = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9_-]{3,64}$/.test(normalized) ? normalized : null;
};

export const readReferralCodeFromSearch = (search: string): string | null => {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return normalizeReferralCode(params.get("ref"));
};
