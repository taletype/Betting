"use client";

import { useEffect, useState } from "react";

import { pendingReferralStorageKey, normalizeReferralCode } from "../lib/referral-capture";

const readCode = (): string | null =>
  normalizeReferralCode(window.localStorage.getItem(pendingReferralStorageKey));

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
