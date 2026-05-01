"use client";

import { useEffect } from "react";

import {
  pendingReferralCookieName,
  referralSessionStorageKey,
  pendingReferralStorageKey,
  appendReferralToInternalHref,
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
  if (!window.localStorage.getItem(referralSessionStorageKey)) {
    window.localStorage.setItem(referralSessionStorageKey, crypto.randomUUID());
  }
  document.cookie = `${pendingReferralCookieName}=${encodeURIComponent(code)}; Path=/; Max-Age=2592000; SameSite=Lax`;
  window.dispatchEvent(new CustomEvent("bet:referral-captured", { detail: { code } }));
};

export const clearPendingReferralCode = (): void => {
  window.localStorage.removeItem(pendingReferralStorageKey);
  document.cookie = `${pendingReferralCookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export function ReferralCapture() {
  useEffect(() => {
    const rawIncoming = new URLSearchParams(window.location.search).get("ref");
    const incoming = readReferralCodeFromSearch(window.location.search);
    if (incoming) {
      trackFunnelEvent("referral_code_seen", { code: incoming });
    }

    if (rawIncoming && !incoming) {
      void fetch("/api/referrals/click", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: rawIncoming,
          queryRef: rawIncoming,
          landingPath: `${window.location.pathname}${window.location.search}`,
          sessionId: window.localStorage.getItem(referralSessionStorageKey) ?? crypto.randomUUID(),
        }),
      }).catch(() => {
        // Best-effort rejection capture; browsing should continue.
      });
    }

    const code = selectReferralCodeToPersist(
      window.localStorage.getItem(pendingReferralStorageKey) ?? readPendingReferralCookie(),
      incoming,
    );
    if (code) {
      persistPendingReferralCode(code);
      trackFunnelEvent("referral_code_captured", { code });
      void fetch("/api/referrals/click", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          queryRef: incoming,
          landingPath: `${window.location.pathname}${window.location.search}`,
          sessionId: window.localStorage.getItem(referralSessionStorageKey),
        }),
      }).catch(() => {
        // Click capture is best-effort; market browsing must never break.
      });
    }
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const code = readPendingReferralCode();
      if (!anchor || !code) return;

      anchor.href = appendReferralToInternalHref(anchor.href, window.location.href, code);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}

export const readPendingReferralCode = (): string | null =>
  normalizeReferralCode(window.localStorage.getItem(pendingReferralStorageKey) ?? readPendingReferralCookie());
