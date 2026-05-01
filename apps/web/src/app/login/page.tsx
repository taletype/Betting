import React from "react";
import Link from "next/link";

import { normalizeAuthNextPath } from "../../lib/auth-redirect";
import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { normalizeReferralCode } from "../../lib/referral-capture";
import { pendingReferralPrimaryCopy, pendingReferralSecondaryCopy } from "../../lib/referral-ui";
import { hasPublicSupabaseConfig } from "../../lib/supabase/config";
import { sendMagicLinkAction } from "../auth-actions";
import { MalformedReferralNotice, PendingReferralNotice } from "../pending-referral-notice";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string; auth?: string; next?: string; ref?: string }>;
}) {
  const params = await searchParams;
  const copy = getLocaleCopy(defaultLocale).auth;
  const next = normalizeAuthNextPath(params?.next);
  const refCode = normalizeReferralCode(params?.ref);
  const malformedRef = Boolean(params?.ref) && !refCode;
  const authUnavailable = params?.auth === "unavailable" && !hasPublicSupabaseConfig();

  return (
    <main className="stack">
      <section className="hero landing-hero">
        <div className="hero-copy stack">
          <span className="badge badge-warning">BETA ACCESS</span>
          <h1>{copy.loginTitle}</h1>
          <p>{copy.loginSubtitle}</p>
          <div className="grid">
            <div className="panel stack">
              <span className="metric-label">身份驗證</span>
              <strong>以電郵連結登入</strong>
              <p className="muted">輸入電郵後，我們會發送一次性登入連結。登入後可查看帳戶、推薦碼、邀請連結及獎勵帳務狀態。</p>
            </div>
            <div className="panel stack">
              <span className="metric-label">Beta 限制</span>
              <strong>只提供市場瀏覽及帳務預覽</strong>
              <p className="muted">此入口不會代用戶下注、交易、託管資金或自動支付推薦獎勵。</p>
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
              <span className="metric-label">Magic link</span>
              <h2 className="section-title">安全登入</h2>
            </div>
            <span className="badge badge-info">EMAIL</span>
          </div>

          {authUnavailable ? <div className="error-state">{copy.authUnavailable}</div> : null}
          {params?.sent === "1" ? <div className="banner banner-success">{copy.magicLinkNotice}</div> : null}

          <form action={sendMagicLinkAction} className="stack">
            <input type="hidden" name="next" value={next} />
            <label className="stack">
              <span className="metric-label">{copy.email}</span>
              <input name="email" type="email" placeholder={copy.emailPlaceholder} required />
            </label>
            <button type="submit">{copy.sendMagicLink}</button>
          </form>

          <div className="banner banner-warning">
            登入只會建立網站會話。任何 Polymarket 操作、錢包連接或資金轉移，均需由你在第三方官方流程中自行確認。
          </div>
          <Link className="secondary-cta" href="/signup">{copy.signup}</Link>
        </aside>
      </section>
    </main>
  );
}
