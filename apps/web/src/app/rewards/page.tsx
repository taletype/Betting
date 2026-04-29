import React from "react";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../lib/locale";
import { formatUsdc } from "../../lib/format";
import { getAmbassadorDashboard, toBigInt } from "../../lib/api";
import { BuilderFeeDisclosureCard } from "../builder-fee-disclosure-card";
import { requestRewardPayoutAction } from "./reward-actions";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).rewards;
  const authCopy = getLocaleCopy(locale).auth;
  const dashboard = await getAmbassadorDashboard().catch(() => null);

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>
        <p>{copy.thresholdNotice}</p>
        <p>{copy.autoCalculationNotice}</p>
        <p>{copy.adminApprovalNotice}</p>
        <p>{copy.polygonPusdNotice}</p>
      </section>
      <BuilderFeeDisclosureCard locale={locale} />

      {!dashboard ? (
        <section className="panel stack">
          <div className="empty-state">{authCopy.sessionRequired}</div>
          <a href="/login">{authCopy.login}</a>
        </section>
      ) : (
        <>
          <section className="grid">
            <article className="panel stack">
              <strong>{getLocaleCopy(locale).ambassador.pendingRewards}</strong>
              <div className="metric-sm">{formatUsdc(dashboard.rewards.pendingRewards, locale)}</div>
            </article>
            <article className="panel stack">
              <strong>{getLocaleCopy(locale).ambassador.payableRewards}</strong>
              <div className="metric-sm">{formatUsdc(dashboard.rewards.payableRewards, locale)}</div>
            </article>
            <article className="panel stack">
              <strong>{getLocaleCopy(locale).ambassador.paidRewards}</strong>
              <div className="metric-sm">{formatUsdc(dashboard.rewards.paidRewards, locale)}</div>
            </article>
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.requestPayout}</h2>
            <form action={requestRewardPayoutAction} className="stack">
              <label className="stack">
                {copy.payoutDestination}
                <input name="destinationValue" placeholder={copy.destinationPlaceholder} required />
              </label>
              <button type="submit" disabled={toBigInt(dashboard.rewards.payableRewards) <= 0n}>{copy.requestPayout}</button>
            </form>
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.ledger}</h2>
            {dashboard.rewardLedger.length === 0 ? (
              <div className="empty-state">{copy.noRewards}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.sourceTrade}</th>
                    <th>{copy.rewardType}</th>
                    <th>{copy.amount}</th>
                    <th>{copy.status}</th>
                    <th>{copy.created}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.rewardLedger.map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono">{entry.sourceTradeAttributionId.slice(0, 8)}</td>
                      <td>{copy.rewardTypes[entry.rewardType] ?? entry.rewardType}</td>
                      <td>{formatUsdc(entry.amountUsdcAtoms, locale)}</td>
                      <td>{copy.statuses[entry.status] ?? entry.status}</td>
                      <td>{formatDateTime(locale, entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.payouts}</h2>
            {dashboard.payouts.length === 0 ? (
              <div className="empty-state">{copy.noPayouts}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.amount}</th>
                    <th>{copy.payoutRail}</th>
                    <th>{copy.status}</th>
                    <th>{copy.payoutDestination}</th>
                    <th>{copy.created}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.payouts.map((payout) => (
                    <tr key={payout.id}>
                      <td>{formatUsdc(payout.amountUsdcAtoms, locale)}</td>
                      <td>{payout.payoutChain} {payout.payoutAsset}</td>
                      <td>{copy.payoutStatuses[payout.status] ?? payout.status}</td>
                      <td>{payout.destinationValue}</td>
                      <td>{formatDateTime(locale, payout.createdAt)}</td>
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
