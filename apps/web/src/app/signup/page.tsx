import React from "react";
import Link from "next/link";

import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { normalizeReferralCode } from "../../lib/referral-capture";
import { pendingReferralPrimaryCopy, pendingReferralSecondaryCopy } from "../../lib/referral-ui";
import { hasPublicSupabaseConfig } from "../../lib/supabase/config";
import { sendMagicLinkAction } from "../auth-actions";
import { FunnelEventTracker } from "../funnel-analytics";
import { MalformedReferralNotice, PendingReferralNotice } from "../pending-referral-notice";
import { TrackedCopyButton } from "../tracked-copy-button";

interface SignupPageProps {
  searchParams?: Promise<{ ref?: string }>;
}

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

export default async function SignupPage({ searchParams }: SignupPageProps = {}) {
  const params = await searchParams;
  const refCode = normalizeReferralCode(params?.ref);
  const malformedRef = Boolean(params?.ref) && !refCode;
  const copy = getLocaleCopy(defaultLocale).auth;
  const inviteUrl = `${siteUrl()}/signup${refCode ? `?ref=${encodeURIComponent(refCode)}` : ""}`;
  const authConfigured = hasPublicSupabaseConfig();

  return (
    <main className="stack">
      <FunnelEventTracker name="signup_started" />
      <section className="hero landing-hero">
        <div className="hero-copy stack">
          <span className="badge badge-success">REFERRAL READY</span>
          <h1>{copy.signupTitle}</h1>
          <p>{copy.signupSubtitle}</p>
          <div className="grid">
            <div className="panel stack">
              <span className="metric-label">推薦捕捉</span>
              <strong>先保存來源，登入後套用</strong>
              <p className="muted">推薦碼會在瀏覽器流程中保存，登入或註冊後再提交至後端作歸因及資格覆核。</p>
            </div>
            <div className="panel stack">
              <span className="metric-label">獎勵模型</span>
              <strong>帳務預覽，不是即時派彩</strong>
              <p className="muted">獎勵需要直接推薦、合資格交易及管理員覆核，不會自動轉帳或加入交易餘額。</p>
            </div>
          </div>
          {refCode ? (
            <div className="banner banner-success">
              <strong>{pendingReferralPrimaryCopy(refCode)}</strong>
              <span>{pendingReferralSecondaryCopy}</span>
            </div>
          ) : malformedRef ? (
            <MalformedReferralNotice />
          ) : (
            <PendingReferralNotice />
          )}
        </div>

        <aside className="panel stack">
          <div className="section-heading-row">
            <div className="stack">
              <span className="metric-label">Create account</span>
              <h2 className="section-title">開始使用</h2>
            </div>
            <span className="badge badge-info">EMAIL</span>
          </div>
          <form action={sendMagicLinkAction} className="stack">
            <input type="hidden" name="next" value="/account" />
            <label className="stack">
              <span className="metric-label">{copy.email}</span>
              <input name="email" type="email" placeholder={copy.emailPlaceholder} required disabled={!authConfigured} />
            </label>
            {!authConfigured ? <div className="error-state">{copy.authUnavailable}</div> : null}
            <button type="submit" disabled={!authConfigured}>{authConfigured ? copy.continueWithEmail : "Auth 尚未設定"}</button>
          </form>
          <Link className="secondary-cta" href="/login">{copy.login}</Link>
          <div className="share-block stack">
            <strong>邀請連結</strong>
            <p className="muted">複製連結給朋友，推薦碼會自動附在註冊入口。</p>
            <TrackedCopyButton
              value={inviteUrl}
              label="複製一般邀請連結"
              copiedLabel="已複製"
              eventName="invite_link_copied"
              metadata={refCode ? { code: refCode, surface: "signup" } : { surface: "signup" }}
            />
          </div>
        </aside>
      </section>
    </main>
  );
}
