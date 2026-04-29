import React from "react";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../lib/locale";
import { formatUsdc } from "../../lib/format";
import { getAmbassadorDashboard } from "../../lib/api";
import { applyReferralCodeAction } from "../auth-actions";
import { CopyButton } from "../copy-button";
import { PendingReferralApplier } from "../pending-referral-applier";

export const dynamic = "force-dynamic";

export default async function AmbassadorPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).ambassador;
  const authCopy = getLocaleCopy(locale).auth;
  const dashboard = await getAmbassadorDashboard().catch(() => null);

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <p>{copy.safeNotice}</p>
        <p>{copy.approvalNotice}</p>
      </section>

      {!dashboard ? (
        <section className="panel stack">
          <div className="empty-state">{authCopy.sessionRequired}</div>
          <a href="/login">{authCopy.login}</a>
        </section>
      ) : (
        <>
          <PendingReferralApplier />
          <section className="grid">
            <article className="panel stack">
              <strong>{copy.code}</strong>
              <div className="metric-sm mono">{dashboard.ambassadorCode.code}</div>
              <CopyButton value={dashboard.ambassadorCode.code} label={copy.copy} copiedLabel={copy.copy} />
            </article>
            <article className="panel stack">
              <strong>{copy.link}</strong>
              <div className="mono">{dashboard.ambassadorCode.inviteUrl}</div>
              <CopyButton value={dashboard.ambassadorCode.inviteUrl} label={copy.copy} copiedLabel={copy.copy} />
            </article>
            <article className="panel stack">
              <strong>{copy.directReferrals}</strong>
              <div className="metric">{dashboard.rewards.directReferralCount.toLocaleString(locale)}</div>
              <div className="muted">{copy.directTradingVolume}: {formatUsdc(dashboard.rewards.directTradingVolumeUsdcAtoms, locale)}</div>
            </article>
          </section>

          <section className="grid">
            <article className="panel stack">
              <strong>{copy.pendingRewards}</strong>
              <div className="metric-sm">{formatUsdc(dashboard.rewards.pendingRewards, locale)}</div>
            </article>
            <article className="panel stack">
              <strong>{copy.payableRewards}</strong>
              <div className="metric-sm">{formatUsdc(dashboard.rewards.payableRewards, locale)}</div>
            </article>
            <article className="panel stack">
              <strong>{copy.paidRewards}</strong>
              <div className="metric-sm">{formatUsdc(dashboard.rewards.paidRewards, locale)}</div>
            </article>
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.manualCodeTitle}</h2>
            <p className="muted">{copy.manualCodeHint}</p>
            <form action={applyReferralCodeAction} className="stack">
              <input name="code" placeholder={copy.manualCodePlaceholder} />
              <button type="submit">{copy.applyCode}</button>
            </form>
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.referredTraders}</h2>
            {dashboard.directReferrals.length === 0 ? (
              <div className="empty-state">{copy.noDirectReferrals}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.referredTraders}</th>
                    <th>{copy.joined}</th>
                    <th>{copy.tradingVolume}</th>
                    <th>{copy.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.directReferrals.map((referral) => (
                    <tr key={referral.userId}>
                      <td>{referral.displayName ?? referral.username ?? referral.userId}</td>
                      <td>{formatDateTime(locale, referral.attributedAt)}</td>
                      <td>{formatUsdc(referral.tradingVolumeUsdcAtoms, locale)}</td>
                      <td>{referral.qualificationStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.teamMembership}</h2>
            <div className="empty-state">{copy.noTeamMembership}</div>
          </section>
        </>
      )}
    </main>
  );
}
