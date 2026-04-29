import React from "react";
import { getAmbassadorDashboard } from "../../lib/api";
import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { applyReferralCodeAction, logoutAction } from "../auth-actions";
import { getCurrentWebUser } from "../auth-session";
import { FunnelEventTracker } from "../funnel-analytics";
import { PendingReferralNotice } from "../pending-referral-notice";
import { PendingReferralApplier } from "../pending-referral-applier";
import { TrackedCopyButton } from "../tracked-copy-button";

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

export default async function AccountPage() {
  const copy = getLocaleCopy(defaultLocale).auth;
  const walletCopy = getLocaleCopy(defaultLocale).wallet;
  const user = await getCurrentWebUser();
  const dashboard = user ? await getAmbassadorDashboard().catch(() => null) : null;

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.accountTitle}</h1>
        <p>{copy.accountSubtitle}</p>
        <PendingReferralNotice />
      </section>

      {!user ? (
        <section className="panel stack">
          <div className="empty-state">{copy.sessionRequired}</div>
          <a href="/login">{copy.login}</a>
        </section>
      ) : (
        <>
          <FunnelEventTracker name="signup_completed" metadata={{ user: "session" }} />
          <PendingReferralApplier />
          <section className="panel stack">
            <div className="kv"><span className="kv-key">User ID</span><span className="kv-value mono">{user.id}</span></div>
            <div className="kv"><span className="kv-key">{copy.email}</span><span className="kv-value">{user.email ?? "-"}</span></div>
            <div className="kv"><span className="kv-key">{copy.walletStatus}</span><span className="kv-value">{walletCopy.notConnected}</span></div>
            <div className="kv"><span className="kv-key">{copy.readinessStatus}</span><span className="kv-value">{getLocaleCopy(defaultLocale).research.readinessCopy.feature_disabled}</span></div>
            <form action={logoutAction}>
              <button type="submit">{copy.logout}</button>
            </form>
          </section>

          <section className="panel stack">
            <strong>推薦碼</strong>
            {dashboard ? (
              <>
                <div className="metric-sm mono">{dashboard.ambassadorCode.code}</div>
                <TrackedCopyButton
                  value={dashboard.ambassadorCode.inviteUrl}
                  label="複製一般邀請連結"
                  copiedLabel="已複製"
                  eventName="invite_link_copied"
                  metadata={{ code: dashboard.ambassadorCode.code, surface: "account" }}
                />
                <TrackedCopyButton
                  value={`${siteUrl()}/polymarket?ref=${encodeURIComponent(dashboard.ambassadorCode.code)}`}
                  label="複製市場推薦連結"
                  copiedLabel="已複製"
                  eventName="market_share_link_copied"
                  metadata={{ code: dashboard.ambassadorCode.code, surface: "account" }}
                />
              </>
            ) : (
              <div className="empty-state">登入後可在此查看你的推薦碼及邀請連結。</div>
            )}
          </section>

          <section className="panel stack">
            <strong>{copy.pendingReferral}</strong>
            <form action={applyReferralCodeAction} className="stack">
              <input name="code" placeholder={getLocaleCopy(defaultLocale).ambassador.manualCodePlaceholder} />
              <button type="submit">{copy.applyReferral}</button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
