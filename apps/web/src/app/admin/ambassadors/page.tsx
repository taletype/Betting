import React from "react";
import { getAdminAmbassadorOverview } from "../../../lib/api";
import { requireCurrentAdmin } from "../../../lib/supabase/server";
import { ReferralFunnelChart, RewardSplitChart } from "../../charts/market-charts";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";

import {
  createAmbassadorCodeAction,
  disableAmbassadorCodeAction,
  overrideReferralAttributionAction,
} from "../actions";
import { EmptyState, MetricCard, StatusChip } from "../../product-ui";

export const dynamic = "force-dynamic";

const toCsv = (rows: NonNullable<Awaited<ReturnType<typeof getAdminAmbassadorOverview>>>["attributions"]) => {
  const header = ["id", "ambassador_code", "referrer_user_id", "referred_user_id", "qualification_status", "attributed_at"].join(",");
  const body = rows.map((row) => [row.id, row.ambassadorCode, row.referrerUserId, row.referredUserId, row.qualificationStatus, row.attributedAt].join(","));
  return [header, ...body].join("\n");
};

type AdminOverview = NonNullable<Awaited<ReturnType<typeof getAdminAmbassadorOverview>>>;

const getRiskFlagsForAttribution = (
  overview: AdminOverview,
  attribution: AdminOverview["attributions"][number],
) => overview.riskFlags.filter((flag) => (
  flag.referralAttributionId === attribution.id ||
  flag.userId === attribution.referredUserId ||
  flag.userId === attribution.referrerUserId
));

export default async function AdminAmbassadorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  await requireCurrentAdmin();
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const overview = await getAdminAmbassadorOverview().catch(() => null);
  const q = (await searchParams)?.q?.trim().toLowerCase() ?? "";
  const visibleCodes = overview?.codes.filter((code) => !q || `${code.code} ${code.ownerUserId} ${code.status}`.toLowerCase().includes(q)) ?? [];
  const visibleAttributions = overview?.attributions.filter((attribution) => !q || `${attribution.ambassadorCode} ${attribution.referrerUserId} ${attribution.referredUserId} ${attribution.qualificationStatus}`.toLowerCase().includes(q)) ?? [];
  const visibleRejectedAttributions = visibleAttributions.filter((attribution) => attribution.qualificationStatus === "rejected" || attribution.rejectionReason);
  const disabledCodes = overview?.codes.filter((code) => code.status === "disabled") ?? [];
  const csvHref = overview ? `data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(visibleAttributions))}` : "#";

  return (
    <main className="stack">
      <section className="hero">
        <h1>推薦歸因管理</h1>
        <p>搜尋推薦碼、檢查直接歸因列表、覆核可疑歸因旗標，並保留人工修正紀錄。</p>
        <div className="market-actions">
          <a className="button-link secondary" href={csvHref} download="ambassador-attributions.csv">匯出 CSV</a>
        </div>
      </section>

      {!overview ? (
        <EmptyState title={copy.noRows} />
      ) : (
        <>
          <form className="panel filters admin-filter-bar" action="/admin/ambassadors">
            <label className="stack">
              搜尋推薦碼 / 用戶 ID
              <input name="q" defaultValue={q} placeholder="輸入推薦碼或用戶 ID" />
            </label>
            <button type="submit">搜尋</button>
            <a className="button-link secondary" href="/admin/ambassadors">重設</a>
          </form>
          <section className="grid">
            <MetricCard label="推薦碼" value={overview.codes.length.toLocaleString(locale)} />
            <MetricCard label="直接歸因" value={overview.attributions.length.toLocaleString(locale)} tone="info" />
            <MetricCard label="已停用推薦碼" value={disabledCodes.length.toLocaleString(locale)} tone="warning" />
            <MetricCard label="被拒歸因嘗試" value={overview.attributions.filter((attribution) => attribution.qualificationStatus === "rejected" || attribution.rejectionReason).length.toLocaleString(locale)} tone="danger" />
            <MetricCard label="可疑旗標" value={(overview.riskFlags ?? []).filter((flag) => flag.status === "open").length.toLocaleString(locale)} tone="warning" />
            <ReferralFunnelChart points={visibleAttributions.map((attribution) => ({ timestamp: attribution.attributedAt, value: 1 }))} />
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
            {visibleCodes.length === 0 ? (
              <EmptyState title={copy.noRows} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.code}</th>
                    <th>Referrer user</th>
                    <th>{copy.status}</th>
                    <th>Disabled</th>
                    <th>Created</th>
                    <th>{copy.disableCode}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCodes.map((code) => (
                    <tr key={code.id}>
                      <td>{code.code}</td>
                      <td className="mono">{code.ownerUserId}</td>
                      <td><StatusChip tone={code.status === "active" ? "success" : "warning"}>{code.status}</StatusChip></td>
                      <td>{code.disabledAt ? formatDateTime(locale, code.disabledAt) : "-"}</td>
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
            {visibleAttributions.length === 0 ? (
              <EmptyState title={copy.noRows} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Direct referred user</th>
                    <th>Referrer user</th>
                    <th>{copy.code}</th>
                    <th>Attribution status</th>
                    <th>Rejected reason</th>
                    <th>Suspicious flags</th>
                    <th>Attributed</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAttributions.map((attribution) => {
                    const riskFlags = getRiskFlagsForAttribution(overview, attribution);

                    return (
                      <tr key={attribution.id}>
                        <td className="mono">{attribution.referredUserId}</td>
                        <td className="mono">{attribution.referrerUserId}</td>
                        <td>{attribution.ambassadorCode}</td>
                        <td><StatusChip tone={attribution.qualificationStatus === "rejected" ? "danger" : attribution.qualificationStatus === "qualified" ? "success" : "warning"}>{attribution.qualificationStatus}</StatusChip></td>
                        <td>{attribution.rejectionReason ?? "-"}</td>
                        <td>{riskFlags.length === 0 ? "-" : riskFlags.map((flag) => `${flag.severity}/${flag.status}/${flag.reasonCode}`).join(", ")}</td>
                        <td>{formatDateTime(locale, attribution.attributedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel stack">
            <h2 className="section-title">Rejected attribution attempts</h2>
            {visibleRejectedAttributions.length === 0 ? (
              <EmptyState title={copy.noRows} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Referred user</th>
                    <th>Referrer user</th>
                    <th>{copy.code}</th>
                    <th>Reason</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRejectedAttributions.map((attribution) => (
                    <tr key={attribution.id}>
                      <td className="mono">{attribution.referredUserId}</td>
                      <td className="mono">{attribution.referrerUserId}</td>
                      <td>{attribution.ambassadorCode}</td>
                      <td>{attribution.rejectionReason ?? attribution.qualificationStatus}</td>
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
              <EmptyState title={copy.noRows} />
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
