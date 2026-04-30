"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { clearPendingReferralCode } from "./referral-capture";
import {
  createReferralApplyIdempotencyKey,
  pendingReferralCookieName,
  pendingReferralStorageKey,
  referralAttributionResultStorageKey,
  referralSessionStorageKey,
  normalizeReferralCode,
} from "../lib/referral-capture";
import { trackFunnelEvent } from "./funnel-analytics";

const writeResult = (result: { status: "applied" | "refused"; code: string; reason?: string }) => {
  window.sessionStorage.setItem(referralAttributionResultStorageKey, JSON.stringify(result));
  window.dispatchEvent(new CustomEvent("bet:referral-attribution-result", { detail: result }));
};

const readCookieCode = (): string | null => {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${pendingReferralCookieName}=`));
  return normalizeReferralCode(cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null);
};

export function PendingReferralApplier() {
  const router = useRouter();

  useEffect(() => {
    const code = normalizeReferralCode(window.localStorage.getItem(pendingReferralStorageKey)) ?? readCookieCode();
    if (!code) return;
    const sessionId = (() => {
      const existing = window.localStorage.getItem(referralSessionStorageKey);
      if (existing) return existing;
      const created = crypto.randomUUID();
      window.localStorage.setItem(referralSessionStorageKey, created);
      return created;
    })();
    const idempotencyKey = createReferralApplyIdempotencyKey(code);

    let cancelled = false;
    void fetch("/api/ambassador/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, idempotencyKey, sessionId }),
    }).then(async (response) => {
      if (cancelled) return;
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        writeResult({ status: "refused", code, reason: payload.error ?? "推薦碼不可用" });
        clearPendingReferralCode();
        trackFunnelEvent("referral_attribution_rejected", { code, reason: payload.error ?? "request_failed" });
        router.refresh();
        return;
      }
      const dashboard = (await response.json().catch(() => null)) as { attribution?: { ambassadorCode?: string | null } | null } | null;
      const appliedCode = normalizeReferralCode(dashboard?.attribution?.ambassadorCode);
      if (appliedCode && appliedCode !== code) {
        writeResult({ status: "refused", code, reason: `已存在推薦碼 ${appliedCode}` });
        trackFunnelEvent("referral_attribution_rejected", { code, reason: "existing_attribution" });
      } else {
        writeResult({ status: "applied", code: appliedCode ?? code });
        trackFunnelEvent("referral_attribution_applied", { code: appliedCode ?? code });
      }
      clearPendingReferralCode();
      router.refresh();
    }).catch(() => {
      // Keep the pending code so the user can retry manually.
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
