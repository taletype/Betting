import React from "react";
import Link from "next/link";

import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { normalizeReferralCode } from "../../lib/referral-capture";
import { sendMagicLinkAction } from "../auth-actions";
import { FunnelEventTracker } from "../funnel-analytics";
import { PendingReferralNotice } from "../pending-referral-notice";
import { TrackedCopyButton } from "../tracked-copy-button";

interface SignupPageProps {
  searchParams?: Promise<{ ref?: string }>;
}

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

export default async function SignupPage({ searchParams }: SignupPageProps = {}) {
  const params = await searchParams;
  const refCode = normalizeReferralCode(params?.ref);
  const copy = getLocaleCopy(defaultLocale).auth;
  const inviteUrl = `${siteUrl()}/signup${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`;

  return (
    <main className="stack">
      <FunnelEventTracker name="signup_started" />
      <section className="hero">
        <h1>{copy.signupTitle}</h1>
        <p>{copy.signupSubtitle}</p>
        {refCode ? <div className="banner banner-success">你正在使用推薦碼：{refCode}</div> : <PendingReferralNotice />}
      </section>

      <section className="panel stack">
        <form action={sendMagicLinkAction} className="stack">
          <input type="hidden" name="next" value="/account" />
          <label className="stack">
            {copy.email}
            <input name="email" type="email" placeholder={copy.emailPlaceholder} required />
          </label>
          <button type="submit">{copy.continueWithEmail}</button>
        </form>
        <Link className="muted" href="/login">{copy.login}</Link>
        <TrackedCopyButton
          value={inviteUrl}
          label="複製一般邀請連結"
          copiedLabel="已複製"
          eventName="invite_link_copied"
          metadata={refCode ? { code: refCode, surface: "signup" } : { surface: "signup" }}
        />
      </section>
    </main>
  );
}
