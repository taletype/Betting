import React from "react";
import { getAdminAmbassadorOverview } from "../../../lib/api";
import { ReferralFunnelChart, RewardSplitChart } from "../../charts/market-charts";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";

import {
  createAmbassadorCodeAction,
  disableAmbassadorCodeAction,
  overrideReferralAttributionAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminAmbassadorsPage() {
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const overview = await getAdminAmbassadorOverview().catch(() => null);

  return (
    <main className="stack">
      <section className="hero">
        <h1>{copy.ambassadors}</h1>
        <p>{copy.subtitle}</p>
      </section>

      {!overview ? (
        <div className="panel empty-state">{copy.noRows}</div>
      ) : (
        <>
          <section className="grid">
            <ReferralFunnelChart points={overview.attributions.map((attribution) => ({ timestamp: attribution.attributedAt, value: 1 }))} />
            <RewardSplitChart
              points={[
                { label: "推薦碼", value: overview.codes.length, tone: "volume" },
                { label: "直接推薦", value: overview.attributions.length, tone: "bid" },
                { label: "待覆核", value: overview.suspiciousAttributions.length, tone: "ask" },
              ]}
            />
          </section>
          <section className="grid">
            <article className="panel stack">
              <strong>{copy.createCode}</strong>
              <form action={createAmbassadorCodeAction} className="stack">
                <input name="ownerUserId" placeholder={copy.ownerUserId} required />
                <input name="code" placeholder={copy.code} />
                <button type="submit">{copy.createCode}</button>
              </form>
            </article>
            <article className="panel stack">
              <strong>{copy.referralAttributions}</strong>
              <form action={overrideReferralAttributionAction} className="stack">
                <input name="referredUserId" placeholder="Referred user ID" required />
                <input name="ambassadorCode" placeholder={copy.code} required />
                <input name="reason" placeholder={copy.reason} required />
                <button type="submit">Override</button>
              </form>
            </article>
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.ambassadors}</h2>
            {overview.codes.length === 0 ? (
              <div className="empty-state">{copy.noRows}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.code}</th>
                    <th>{copy.ownerUserId}</th>
                    <th>{copy.status}</th>
                    <th>Created</th>
                    <th>{copy.disableCode}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.codes.map((code) => (
                    <tr key={code.id}>
                      <td>{code.code}</td>
                      <td className="mono">{code.ownerUserId}</td>
                      <td>{code.status}</td>
                      <td>{formatDateTime(locale, code.createdAt)}</td>
                      <td>
                        {code.status === "active" ? (
                          <form action={disableAmbassadorCodeAction} className="stack">
                            <input type="hidden" name="codeId" value={code.id} />
                            <input name="reason" placeholder={copy.reason} required />
                            <button type="submit">{copy.disableCode}</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.referralAttributions}</h2>
            {overview.attributions.length === 0 ? (
              <div className="empty-state">{copy.noRows}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Referred</th>
                    <th>Referrer</th>
                    <th>{copy.code}</th>
                    <th>{copy.status}</th>
                    <th>Attributed</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.attributions.map((attribution) => (
                    <tr key={attribution.id}>
                      <td className="mono">{attribution.referredUserId}</td>
                      <td className="mono">{attribution.referrerUserId}</td>
                      <td>{attribution.ambassadorCode}</td>
                      <td>{attribution.qualificationStatus}</td>
                      <td>{formatDateTime(locale, attribution.attributedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.suspiciousReview}</h2>
            {(overview.riskFlags ?? []).length === 0 ? (
              <div className="empty-state">{copy.noRows}</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Related user</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview.riskFlags ?? []).map((flag) => (
                    <tr key={flag.id}>
                      <td>{flag.severity}</td>
                      <td>{flag.status}</td>
                      <td>{flag.reasonCode}</td>
                      <td className="mono">{flag.userId ?? flag.referralAttributionId ?? flag.tradeAttributionId ?? flag.payoutId ?? "-"}</td>
                      <td>{formatDateTime(locale, flag.createdAt)}</td>
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
