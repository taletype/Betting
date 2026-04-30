import React from "react";
import { getAdminAmbassadorOverview, toBigInt } from "../../../lib/api";
import { requireCurrentAdmin } from "../../../lib/supabase/server";
import { PayoutStatusChart, VolumeHistoryChart } from "../../charts/market-charts";
import { formatUsdc } from "../../../lib/format";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";

import {
  approveRewardPayoutAction,
  cancelRewardPayoutAction,
  failRewardPayoutAction,
  markRewardPayoutPaidAction,
} from "../actions";
import { EmptyState, MetricCard, StatusChip } from "../../product-ui";

export const dynamic = "force-dynamic";

const explorerBaseUrl = (process.env.POLYGON_EXPLORER_URL ?? "https://polygonscan.com").replace(/\/+$/, "");

const toCsv = (rows: Awaited<ReturnType<typeof getAdminAmbassadorOverview>>["payouts"]) => {
  const header = [
    "id",
    "recipient_user_id",
    "amount_usdc_atoms",
    "status",
    "payout_chain",
    "payout_asset",
    "destination_type",
    "destination_value",
    "tx_hash",
  ].join(",");
  const body = rows.map((row) => [
    row.id,
    row.recipientUserId,
    row.amountUsdcAtoms.toString(),
    row.status,
    row.payoutChain,
    row.payoutAsset,
    row.destinationType,
    row.destinationValue.replaceAll(",", " "),
    row.txHash ?? "",
  ].join(","));
  return [header, ...body].join("\n");
};

const getRiskFlagsForPayout = (
  overview: NonNullable<Awaited<ReturnType<typeof getAdminAmbassadorOverview>>>,
  payout: NonNullable<Awaited<ReturnType<typeof getAdminAmbassadorOverview>>>["payouts"][number],
) => {
  const relatedTradeIds = new Set(
    overview.rewardLedger
      .filter((reward) => reward.recipientUserId === payout.recipientUserId)
      .map((reward) => reward.sourceTradeAttributionId),
  );
  const relatedTrades = overview.tradeAttributions.filter((trade) => relatedTradeIds.has(trade.id));
  const relatedReferralIds = new Set(
    overview.attributions
      .filter((attribution) => (
        attribution.referredUserId === payout.recipientUserId ||
        attribution.referrerUserId === payout.recipientUserId ||
        relatedTrades.some((trade) => (
          attribution.referredUserId === trade.userId ||
          attribution.referrerUserId === trade.directReferrerUserId
        ))
      ))
      .map((attribution) => attribution.id),
  );

  return overview.riskFlags.filter((flag) => (
    flag.payoutId === payout.id ||
    flag.userId === payout.recipientUserId ||
    (flag.tradeAttributionId !== null && relatedTradeIds.has(flag.tradeAttributionId)) ||
    (flag.referralAttributionId !== null && relatedReferralIds.has(flag.referralAttributionId))
  ));
};

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string }>;
}) {
  await requireCurrentAdmin();
  const locale = defaultLocale;
  const copy = getLocaleCopy(locale).admin;
  const rewardCopy = getLocaleCopy(locale).rewards;
  const overview = await getAdminAmbassadorOverview().catch(() => null);
  const toUsdcNumber = (value: string | number | bigint | null | undefined) => Number(toBigInt(value)) / 1_000_000;
  const q = (await searchParams)?.q?.trim().toLowerCase() ?? "";
  const visiblePayouts = overview?.payouts.filter((payout) => !q || `${payout.id} ${payout.recipientUserId} ${payout.destinationValue} ${payout.status} ${payout.txHash ?? ""}`.toLowerCase().includes(q)) ?? [];
  const csvHref = overview
    ? `data:text/csv;charset=utf-8,${encodeURIComponent(toCsv(visiblePayouts))}`
    : "#";

  return (
    <main className="stack">
      <section className="hero">
        <h1>人工支付審批</h1>
        <p>逐筆覆核支付申請、檢查風險旗標，批准後以 Polygon 交易雜湊標記為已支付。</p>
        <a className="button-link secondary" href={csvHref} download="ambassador-payouts.csv">{copy.exportCsv}</a>
      </section>

      {!overview ? (
        <EmptyState title={copy.noRows} />
      ) : overview.payouts.length === 0 ? (
        <EmptyState title={copy.noRows} />
      ) : (
        <>
        <form className="panel filters admin-filter-bar" action="/admin/payouts">
          <label className="stack">
            搜尋推薦碼 / 用戶 ID / Polygon 地址
            <input name="q" defaultValue={q} placeholder="輸入用戶、地址、狀態或 tx hash" />
          </label>
          <button type="submit">搜尋</button>
          <a className="button-link secondary" href="/admin/payouts">重設</a>
        </form>
        <section className="grid">
          <MetricCard label="待審批隊列" value={overview.payouts.filter((payout) => payout.status === "requested").length.toLocaleString(locale)} tone="warning" />
          <MetricCard label="已批准待標記支付" value={overview.payouts.filter((payout) => payout.status === "approved").length.toLocaleString(locale)} tone="info" />
          <MetricCard label="已支付" value={overview.payouts.filter((payout) => payout.status === "paid").length.toLocaleString(locale)} tone="success" />
          <MetricCard label="高風險待覆核" value={overview.riskFlags.filter((flag) => flag.severity === "high" && flag.status === "open").length.toLocaleString(locale)} tone="danger" />
        </section>
        <section className="grid">
          <PayoutStatusChart
            points={["requested", "approved", "paid", "failed", "cancelled"].map((status) => ({
              label: rewardCopy.payoutStatuses[status] ?? status,
              value: overview.payouts.filter((payout) => payout.status === status).length,
              tone: status === "paid" ? "bid" : status === "failed" || status === "cancelled" ? "ask" : "volume",
            }))}
          />
          <VolumeHistoryChart
            points={overview.payouts.map((payout) => ({
              timestamp: payout.createdAt,
              value: toUsdcNumber(payout.amountUsdcAtoms),
            }))}
          />
        </section>
        <section className="panel stack">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{copy.userId}</th>
                <th>{rewardCopy.amount}</th>
                <th>{copy.payoutRail}</th>
                <th>{copy.asset}</th>
                <th>{rewardCopy.status}</th>
                <th>Risk</th>
                <th>{rewardCopy.payoutDestination}</th>
                <th>{copy.txHash}</th>
                <th>{copy.approve}</th>
                <th>{copy.markPaid}</th>
                <th>{copy.markFailed}</th>
              </tr>
            </thead>
            <tbody>
              {visiblePayouts.map((payout) => {
                const riskFlags = getRiskFlagsForPayout(overview, payout);
                const hasBlockingRisk = riskFlags.some((flag) => flag.severity === "high" && flag.status === "open");

                return (
                  <tr key={payout.id}>
                    <td className="mono">{payout.id.slice(0, 8)}</td>
                    <td className="mono">{payout.recipientUserId}</td>
                    <td>{formatUsdc(payout.amountUsdcAtoms, locale)}</td>
                    <td>{payout.payoutChain} #{payout.payoutChainId}</td>
                    <td>{payout.payoutAsset}</td>
                    <td><StatusChip tone={payout.status === "paid" ? "success" : payout.status === "failed" || payout.status === "cancelled" ? "danger" : "warning"}>{rewardCopy.payoutStatuses[payout.status] ?? payout.status}</StatusChip></td>
                    <td>
                      {riskFlags.length === 0 ? (
                        "-"
                      ) : (
                        <div className="stack">
                          {riskFlags.map((flag) => (
                            <div key={flag.id} className={flag.severity === "high" && flag.status === "open" ? "status-bad" : "muted"}>
                              {flag.severity} / {flag.status} / {flag.reasonCode}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{payout.destinationValue}</td>
                    <td>
                      {payout.txHash ? (
                        <a href={`${explorerBaseUrl}/tx/${payout.txHash}`} target="_blank" rel="noreferrer">
                          {copy.polygonscan}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <form action={approveRewardPayoutAction} className="stack">
                        <input type="hidden" name="payoutId" value={payout.id} />
                        <input name="notes" placeholder={copy.notes} />
                        <button type="submit" disabled={payout.status !== "requested" || hasBlockingRisk}>{copy.approve}</button>
                      </form>
                    </td>
                    <td>
                      <form action={markRewardPayoutPaidAction} className="stack">
                        <input type="hidden" name="payoutId" value={payout.id} />
                        <input name="txHash" placeholder={copy.txHash} required />
                        <input name="notes" placeholder={copy.notes} />
                        <button type="submit" disabled={payout.status !== "approved"}>{copy.markPaid}</button>
                      </form>
                    </td>
                    <td>
                      <form action={failRewardPayoutAction} className="stack">
                        <input type="hidden" name="payoutId" value={payout.id} />
                        <input name="notes" placeholder={copy.notes} required />
                        <button type="submit" disabled={payout.status === "paid"}>{copy.markFailed}</button>
                      </form>
                      <form action={cancelRewardPayoutAction} className="stack">
                        <input type="hidden" name="payoutId" value={payout.id} />
                        <input name="notes" placeholder={copy.notes} required />
                        <button type="submit" disabled={payout.status === "paid"}>{copy.cancel}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted">Updated {formatDateTime(locale, new Date().toISOString())}</div>
        </section>
        </>
      )}
    </main>
  );
}
