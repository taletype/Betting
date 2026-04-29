"use client";

import { useEffect } from "react";

import { pendingReferralCookieName, pendingReferralStorageKey, readReferralCodeFromSearch } from "../lib/referral-capture";

export const persistPendingReferralCode = (code: string): void => {
  window.localStorage.setItem(pendingReferralStorageKey, code);
  document.cookie = `${pendingReferralCookieName}=${encodeURIComponent(code)}; Path=/; Max-Age=2592000; SameSite=Lax`;
};

export const clearPendingReferralCode = (): void => {
  window.localStorage.removeItem(pendingReferralStorageKey);
  document.cookie = `${pendingReferralCookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export function ReferralCapture() {
  useEffect(() => {
    const code = readReferralCodeFromSearch(window.location.search);
    if (code) {
      persistPendingReferralCode(code);
    }
  }, []);

  return null;
}
