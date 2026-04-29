import React from "react";
import { defaultLocale, getLocaleCopy } from "../../lib/locale";
import { applyReferralCodeAction, logoutAction } from "../auth-actions";
import { getCurrentWebUser } from "../auth-session";
import { FunnelEventTracker } from "../funnel-analytics";
import { PendingReferralNotice } from "../pending-referral-notice";
import { PendingReferralApplier } from "../pending-referral-applier";

export default async function AccountPage() {
  const copy = getLocaleCopy(defaultLocale).auth;
  const walletCopy = getLocaleCopy(defaultLocale).wallet;
  const user = await getCurrentWebUser();

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
