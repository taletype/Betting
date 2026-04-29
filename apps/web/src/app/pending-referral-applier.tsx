"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { clearPendingReferralCode } from "./referral-capture";
import { pendingReferralStorageKey, normalizeReferralCode } from "../lib/referral-capture";

export function PendingReferralApplier() {
  const router = useRouter();

  useEffect(() => {
    const code = normalizeReferralCode(window.localStorage.getItem(pendingReferralStorageKey));
    if (!code) return;

    let cancelled = false;
    void fetch("/api/ambassador/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }).then((response) => {
      if (cancelled || !response.ok) return;
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
