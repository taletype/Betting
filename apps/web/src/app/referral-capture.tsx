"use client";

import { useEffect } from "react";

import {
  pendingReferralCookieName,
  pendingReferralStorageKey,
  normalizeReferralCode,
  readReferralCodeFromSearch,
  selectReferralCodeToPersist,
} from "../lib/referral-capture";
import { trackFunnelEvent } from "./funnel-analytics";

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
    const incoming = readReferralCodeFromSearch(window.location.search);
    if (incoming) {
      trackFunnelEvent("referral_code_seen", { code: incoming });
    }

    const code = selectReferralCodeToPersist(
      window.localStorage.getItem(pendingReferralStorageKey) ?? readPendingReferralCookie(),
      incoming,
    );
    if (code) {
      persistPendingReferralCode(code);
      trackFunnelEvent("referral_code_captured", { code });
    }
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const code = readPendingReferralCode();
      if (!anchor || !code) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.searchParams.has("ref")) return;
      url.searchParams.set("ref", code);
      anchor.href = `${url.pathname}${url.search}${url.hash}`;
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}

export const readPendingReferralCode = (): string | null =>
  normalizeReferralCode(window.localStorage.getItem(pendingReferralStorageKey) ?? readPendingReferralCookie());
