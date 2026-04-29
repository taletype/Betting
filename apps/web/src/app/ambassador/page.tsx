import React from "react";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../lib/locale";
import { formatUsdc } from "../../lib/format";
import { getAmbassadorDashboard } from "../../lib/api";
import { applyReferralCodeAction } from "../auth-actions";
import { BuilderFeeDisclosureCard } from "../builder-fee-disclosure-card";
import { PendingReferralApplier } from "../pending-referral-applier";
import { TrackedCopyButton } from "../tracked-copy-button";

export const dynamic = "force-dynamic";

export default async function AmbassadorPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).ambassador;
  const authCopy = getLocaleCopy(locale).auth;
  const dashboard = await getAmbassadorDashboard().catch(() => null);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <p>{copy.safeNotice}</p>
        <p>{copy.approvalNotice}</p>
      </section>
      <BuilderFeeDisclosureCard locale={locale} />

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
              <TrackedCopyButton value={dashboard.ambassadorCode.code} label={copy.copy} copiedLabel="已複製" eventName="invite_link_copied" metadata={{ code: dashboard.ambassadorCode.code }} />
            </article>
            <article className="panel stack">
              <strong>{copy.link}</strong>
              <div className="mono">{dashboard.ambassadorCode.inviteUrl}</div>
              <TrackedCopyButton value={dashboard.ambassadorCode.inviteUrl} label={copy.copy} copiedLabel="已複製" eventName="invite_link_copied" metadata={{ code: dashboard.ambassadorCode.code }} />
            </article>
            <article className="panel stack">
              <strong>市場推薦連結</strong>
              <div className="mono">{`${siteUrl}/polymarket?ref=${encodeURIComponent(dashboard.ambassadorCode.code)}`}</div>
              <TrackedCopyButton
                value={`${siteUrl}/polymarket?ref=${encodeURIComponent(dashboard.ambassadorCode.code)}`}
                label={copy.copy}
                copiedLabel="已複製"
                eventName="market_share_link_copied"
                metadata={{ code: dashboard.ambassadorCode.code, surface: "polymarket_feed" }}
              />
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
        </>
      )}
    </main>
  );
}
