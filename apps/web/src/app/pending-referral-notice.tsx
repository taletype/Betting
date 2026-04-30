"use client";

import React, { createElement, useEffect, useState } from "react";

import {
  pendingReferralCookieName,
  pendingReferralStorageKey,
  referralAttributionResultStorageKey,
  normalizeReferralCode,
} from "../lib/referral-capture";
import {
  mapReferralRejectionReason,
  pendingReferralPrimaryCopy,
  pendingReferralSecondaryCopy,
  referralAppliedCopy,
  referralRejectedCopy,
} from "../lib/referral-ui";

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
  suffix,
}: {
  prefix?: string;
  suffix?: string;
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

  return code ? (
    <div className="banner banner-success">
      <strong>{prefix === "你正在使用推薦碼：" ? pendingReferralPrimaryCopy(code) : `${prefix}${code}`}</strong>
      {suffix ? <span>{suffix}</span> : prefix === "你正在使用推薦碼：" ? <span>{pendingReferralSecondaryCopy}</span> : null}
    </div>
  ) : null;
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
    return <div className="banner banner-success">{referralAppliedCopy}</div>;
  }

  const safeReason = mapReferralRejectionReason(result.reason);
  return (
    <div className="banner banner-warning">
      <div>{referralRejectedCopy}</div>
      {safeReason ? <div>{safeReason}</div> : null}
    </div>
  );
}

export function MalformedReferralNotice() {
  return createElement(
    "div",
    { className: "banner banner-warning" },
    createElement("div", null, referralRejectedCopy),
    createElement("div", null, "推薦碼無效"),
  );
}
