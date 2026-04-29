"use client";

import { useEffect } from "react";

import {
  pendingReferralCookieName,
  pendingReferralStorageKey,
  readReferralCodeFromSearch,
  selectReferralCodeToPersist,
} from "../lib/referral-capture";

const readPendingReferralCookie = (): string | null => {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${pendingReferralCookieName}=`));

  return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null;
};

export const persistPendingReferralCode = (code: string): void => {
  window.localStorage.setItem(pendingReferralStorageKey, code);
  document.cookie = `${pendingReferralCookieName}=${encodeURIComponent(code)}; Path=/; Max-Age=2592000; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent("bet:referral-captured", { detail: { code } }));
};

export const clearPendingReferralCode = (): void => {
  window.localStorage.removeItem(pendingReferralStorageKey);
  document.cookie = `${pendingReferralCookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export function ReferralCapture() {
  useEffect(() => {
    const code = selectReferralCodeToPersist(
      window.localStorage.getItem(pendingReferralStorageKey) ?? readPendingReferralCookie(),
      readReferralCodeFromSearch(window.location.search),
    );
    if (code) {
      persistPendingReferralCode(code);
    }
  }, []);

  return null;
}
