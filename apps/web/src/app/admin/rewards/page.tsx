import React from "react";
import { getAdminAmbassadorOverview, toBigInt } from "../../../lib/api";
import { requireCurrentAdmin } from "../../../lib/supabase/server";
import { RewardSplitChart, VolumeHistoryChart } from "../../charts/market-charts";
import { formatUsdc } from "../../../lib/format";
import { defaultLocale, formatDateTime, getLocaleCopy } from "../../../lib/locale";

import {
  markRewardsPayableAction,
  recordMockBuilderTradeAction,
  voidTradeRewardsAction,
} from "../actions";
import { EmptyState, MetricCard, StatusChip } from "../../product-ui";

export const dynamic = "force-dynamic";

type AdminOverview = NonNullable<Awaited<ReturnType<typeof getAdminAmbassadorOverview>>>;

const getBuilderAttributionSource = (trade: AdminOverview["tradeAttributions"][number]): string => {
  if (trade.polymarketTradeId) return `Polymarket trade ${trade.polymarketTradeId}`;
  if (trade.polymarketOrderId) return `Polymarket order ${trade.polymarketOrderId}`;
  if (trade.conditionId) return `Condition ${trade.conditionId}`;
  if (trade.marketSlug) return `Market ${trade.marketSlug}`;
  return "manual/admin mock";
};

const countRewardsByType = (
  rewards: AdminOverview["rewardLedger"],
  rewardType: string,
) => rewards
  .filter((entry) => entry.rewardType === rewardType)
  .reduce((sum, entry) => sum + toBigInt(entry.amountUsdcAtoms), 0n);

const getDuplicateLedgerIndicator = (
  rewards: AdminOverview["rewardLedger"],
  entry: AdminOverview["rewardLedger"][number],
): string => {
  const sameKey = rewards.filter((candidate) => (
    candidate.sourceTradeAttributionId === entry.sourceTradeAttributionId &&
    candidate.rewardType === entry.rewardType
  ));
  return sameKey.length > 1 ? `duplicate key x${sameKey.length}` : "idempotent key unique";
};

const getRiskFlagsForReward = (
  overview: AdminOverview,
  entry: AdminOverview["rewardLedger"][number],
) => overview.riskFlags.filter((flag) => (
  flag.tradeAttributionId === entry.sourceTradeAttributionId ||
  flag.userId === entry.recipientUserId
));

export default async function AdminRewardsPage({
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
  const visibleTrades = overview?.tradeAttributions.filter((trade) => !q || `${trade.id} ${trade.userId} ${trade.marketSlug ?? ""} ${trade.conditionId ?? ""} ${trade.status}`.toLowerCase().includes(q)) ?? [];
  const visibleRewards = overview?.rewardLedger.filter((entry) => !q || `${entry.id} ${entry.recipientUserId} ${entry.sourceTradeAttributionId} ${entry.status}`.toLowerCase().includes(q)) ?? [];
  const rewardTotal = (status: string) =>
    overview?.rewardLedger
      .filter((entry) => entry.status === status)
      .reduce((sum, entry) => sum + toBigInt(entry.amountUsdcAtoms), 0n) ?? 0n;

  return (
    <main className="stack">
      <section className="hero">
        <h1>獎勵帳務管理</h1>
        <p>覆核 Builder 歸因狀態、確認待處理獎勵、將合資格紀錄標記為可支付，或作廢有問題歸因。</p>
      </section>

      {!overview ? (
        <EmptyState title={copy.noRows} />
      ) : (
        <>
          <form className="panel filters admin-filter-bar" action="/admin/rewards">
            <label className="stack">
              搜尋推薦碼 / 歸因 ID / 用戶 ID
              <input name="q" defaultValue={q} placeholder="輸入用戶、歸因或市場 ID" />
            </label>
            <button type="submit">搜尋</button>
            <a className="button-link secondary" href="/admin/rewards">重設</a>
          </form>
          <section className="grid">
            <MetricCard label="待確認獎勵" value={formatUsdc(rewardTotal("pending"), locale)} tone="warning" />
            <MetricCard label="可支付獎勵" value={formatUsdc(rewardTotal("payable"), locale)} tone="success" />
            <MetricCard label="已支付獎勵" value={formatUsdc(rewardTotal("paid"), locale)} />
            <MetricCard label="Builder 歸因狀態" value={`${overview.tradeAttributions.filter((trade) => trade.status === "confirmed").length}/${overview.tradeAttributions.length}`} note="已確認 / 全部歸因" tone="info" />
            <MetricCard label="平台分帳" value={formatUsdc(countRewardsByType(overview.rewardLedger, "platform_revenue"), locale)} />
            <MetricCard label="推薦人分帳" value={formatUsdc(countRewardsByType(overview.rewardLedger, "direct_referrer_commission"), locale)} />
            <MetricCard label="交易者分帳" value={formatUsdc(countRewardsByType(overview.rewardLedger, "trader_cashback"), locale)} />
            <MetricCard label="可疑獎勵旗標" value={overview.riskFlags.filter((flag) => flag.status === "open" && (flag.tradeAttributionId || flag.userId)).length.toLocaleString(locale)} tone="warning" />
          </section>
          <section className="grid">
            <RewardSplitChart
              points={["pending", "payable", "paid", "void"].map((status) => ({
                label: rewardCopy.statuses[status] ?? status,
                value: overview.rewardLedger.filter((entry) => entry.status === status).reduce((sum, entry) => sum + toUsdcNumber(entry.amountUsdcAtoms), 0),
                tone: status === "paid" ? "bid" : status === "void" ? "ask" : "volume",
              }))}
            />
            <VolumeHistoryChart
              points={overview.tradeAttributions.map((trade) => ({
                timestamp: trade.confirmedAt ?? new Date().toISOString(),
                value: toUsdcNumber(trade.builderFeeUsdcAtoms),
              }))}
            />
          </section>
          <section className="panel stack">
            <h2 className="section-title">{copy.manualTrade}</h2>
            <form action={recordMockBuilderTradeAction} className="stack">
              <input name="userId" placeholder={copy.userId} required />
              <input name="polymarketOrderId" placeholder="Polymarket order ID" />
              <input name="polymarketTradeId" placeholder="Polymarket trade ID" />
              <input name="conditionId" placeholder="Condition ID" />
              <input name="marketSlug" placeholder="Market slug" />
              <input name="notionalUsdcAtoms" type="number" min="1" placeholder={copy.notional} required />
              <input name="builderFeeUsdcAtoms" type="number" min="1" placeholder={copy.builderFee} required />
              <button type="submit">{copy.recordConfirmedTrade}</button>
            </form>
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.tradeAttributions}</h2>
            {visibleTrades.length === 0 ? (
              <EmptyState title={copy.noRows} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{copy.userId}</th>
                    <th>Builder attribution source</th>
                    <th>Referrer</th>
                    <th>{copy.builderFee}</th>
                    <th>{copy.status}</th>
                    <th>Observed</th>
                    <th>{copy.markPayable}</th>
                    <th>Void</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTrades.map((trade) => (
                    <tr key={trade.id}>
                      <td className="mono">{trade.id.slice(0, 8)}</td>
                      <td className="mono">{trade.userId}</td>
                      <td className="mono">{getBuilderAttributionSource(trade)}</td>
                      <td className="mono">{trade.directReferrerUserId ?? "-"}</td>
                      <td>{formatUsdc(trade.builderFeeUsdcAtoms, locale)}</td>
                      <td><StatusChip tone={trade.status === "confirmed" ? "success" : trade.status === "void" ? "danger" : "warning"}>{trade.status}</StatusChip></td>
                      <td>{formatDateTime(locale, trade.observedAt)}</td>
                      <td>
                        <form action={markRewardsPayableAction}>
                          <input type="hidden" name="tradeAttributionId" value={trade.id} />
                          <button type="submit" disabled={trade.status !== "confirmed"}>{copy.markPayable}</button>
                        </form>
                      </td>
                      <td>
                        <form action={voidTradeRewardsAction} className="stack">
                          <input type="hidden" name="tradeAttributionId" value={trade.id} />
                          <input name="reason" placeholder={copy.reason} required />
                          <button type="submit">Void</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel stack">
            <h2 className="section-title">{copy.rewardLedger}</h2>
            {visibleRewards.length === 0 ? (
              <EmptyState title={copy.noRows} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{rewardCopy.sourceTrade}</th>
                    <th>Recipient</th>
                    <th>{rewardCopy.rewardType}</th>
                    <th>{rewardCopy.amount}</th>
                    <th>{rewardCopy.status}</th>
                    <th>Duplicate / idempotency</th>
                    <th>Suspicious flags</th>
                    <th>{rewardCopy.created}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRewards.map((entry) => {
                    const riskFlags = getRiskFlagsForReward(overview, entry);

                    return (
                      <tr key={entry.id}>
                        <td className="mono">{entry.sourceTradeAttributionId.slice(0, 8)}</td>
                        <td className="mono">{entry.recipientUserId ?? "platform"}</td>
                        <td>{rewardCopy.rewardTypes[entry.rewardType] ?? entry.rewardType}</td>
                        <td>{formatUsdc(entry.amountUsdcAtoms, locale)}</td>
                        <td><StatusChip tone={entry.status === "paid" ? "success" : entry.status === "void" ? "danger" : entry.status === "payable" ? "info" : "warning"}>{rewardCopy.statuses[entry.status] ?? entry.status}</StatusChip></td>
                        <td>{getDuplicateLedgerIndicator(overview.rewardLedger, entry)}</td>
                        <td>{riskFlags.length === 0 ? "-" : riskFlags.map((flag) => `${flag.severity}/${flag.status}/${flag.reasonCode}`).join(", ")}</td>
                        <td>{formatDateTime(locale, entry.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </main>
  );
}
