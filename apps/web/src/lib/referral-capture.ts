export const pendingReferralStorageKey = "bet_pending_referral_code";
export const pendingReferralCookieName = "bet_pending_ref";
export const referralAttributionResultStorageKey = "bet_referral_attribution_result";
export const referralSessionStorageKey = "bet_referral_session_id";

export const createReferralApplyIdempotencyKey = (userScopedCode: string): string | null => {
  const code = normalizeReferralCode(userScopedCode);
  return code ? `referral-apply:${code}` : null;
};

export const isTerminalReferralApplyFailure = (
  status: number,
  reason: string | null | undefined,
): boolean => {
  if (status === 400 || status === 409 || status === 422) return true;
  const normalized = reason?.toLowerCase() ?? "";
  return [
    "malformed_referral_code",
    "invalid_referral_code",
    "disabled_referral_code",
    "self_referral",
    "self-referral",
    "same_user_multiple_ref_codes",
    "duplicate_referral",
    "ambassador code is malformed",
    "invalid ambassador code",
    "ambassador code is disabled",
    "self-referrals are not allowed",
  ].some((terminalReason) => normalized.includes(terminalReason));
};

export const normalizeReferralCode = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z0-9_-]{3,64}$/.test(normalized) ? normalized : null;
};

export const readReferralCodeFromSearch = (search: string): string | null => {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  return normalizeReferralCode(params.get("ref"));
};

export const selectReferralCodeToPersist = (
  existingCode: string | null | undefined,
  incomingCode: string | null | undefined,
): string | null => {
  const existing = normalizeReferralCode(existingCode);
  const incoming = normalizeReferralCode(incomingCode);

  if (!incoming || existing) {
    return null;
  }

  return incoming;
};

export const appendReferralToInternalHref = (
  href: string,
  currentHref: string,
  pendingCode: string | null | undefined,
): string => {
  const code = normalizeReferralCode(pendingCode);
  if (!code) return href;

  const url = new URL(href, currentHref);
  const current = new URL(currentHref);
  if (url.origin !== current.origin || url.searchParams.has("ref")) return href;

  url.searchParams.set("ref", code);
  return `${url.pathname}${url.search}${url.hash}`;
};
