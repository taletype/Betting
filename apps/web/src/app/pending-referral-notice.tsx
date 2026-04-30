"use client";

import { useEffect, useState } from "react";

import {
  pendingReferralCookieName,
  pendingReferralStorageKey,
  referralAttributionResultStorageKey,
  normalizeReferralCode,
} from "../lib/referral-capture";

type ReferralAttributionResult = {
  status: "applied" | "refused";
  code: string;
  reason?: string;
};

const readCookieCode = (): string | null => {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${pendingReferralCookieName}=`));
  return normalizeReferralCode(cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : null);
};

const readCode = (): string | null => {
  try {
    return normalizeReferralCode(window.localStorage.getItem(pendingReferralStorageKey)) ?? readCookieCode();
  } catch {
    return readCookieCode();
  }
};

const readAttributionResult = (): ReferralAttributionResult | null => {
  try {
    const raw = window.sessionStorage.getItem(referralAttributionResultStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReferralAttributionResult>;
    const code = normalizeReferralCode(parsed.code);
    if ((parsed.status === "applied" || parsed.status === "refused") && code) {
      return { status: parsed.status, code, reason: parsed.reason };
    }
  } catch {
    return null;
  }
  return null;
};

export function PendingReferralNotice({
  prefix = "你正在使用推薦碼：",
}: {
  prefix?: string;
}) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    setCode(readCode());
    const onCaptured = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string }>).detail;
      setCode(normalizeReferralCode(detail?.code) ?? readCode());
    };
    window.addEventListener("bet:referral-captured", onCaptured);
    return () => window.removeEventListener("bet:referral-captured", onCaptured);
  }, []);

  return code ? <div className="banner banner-success">{prefix}{code}</div> : null;
}

export function ReferralAttributionResultNotice() {
  const [result, setResult] = useState<ReferralAttributionResult | null>(null);

  useEffect(() => {
    const refresh = () => setResult(readAttributionResult());
    refresh();
    window.addEventListener("bet:referral-attribution-result", refresh);
    return () => window.removeEventListener("bet:referral-attribution-result", refresh);
  }, []);

  if (!result) return null;

  if (result.status === "applied") {
    return <div className="banner banner-success">推薦碼已套用：{result.code}</div>;
  }

  return (
    <div className="banner banner-warning">
      推薦碼未能套用：{result.code}{result.reason ? `（${result.reason}）` : ""}
    </div>
  );
}
